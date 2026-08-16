import { z } from 'zod'

import {
  createBusinessBatch,
  createToolLaunchGrant,
  finishBusinessBatch,
  updateBusinessBatch,
  updateBusinessBatchItem,
} from '@/utils/api'

import {
  batchEventSchema,
  businessBatchSnapshotSchema,
  launchGrantEnvelopeSchema,
  launchGrantSchema,
  serverBatchSchema,
  type BatchEvent,
  type BusinessBatchSnapshot,
  type BusinessTool,
  type ImportPreview,
} from './model'
import { BusinessWorkspaceOutbox, type WorkspaceSyncState } from './workspace-outbox'
import { errorMessage, ipcPayload, requireBatchApi, unwrapData } from './workspace-helpers'

const serverBatchItemStatusSchema = z.enum(['pending', 'running', 'waiting_user', 'completed', 'failed', 'cancelled'])
const serverInterventionTypeSchema = z.enum(['login', 'captcha', 'two_factor', 'page_confirmation', 'other'])

export interface BusinessLiveDependencies {
  getSnapshot(): BusinessBatchSnapshot
  setSnapshot(snapshot: BusinessBatchSnapshot): void
  getSelectedTool(): BusinessTool | null
  selectItem(itemId: string): void
  setSyncState(state: WorkspaceSyncState): void
  setError(message: string | null): void
}

/** Owns Electron batch events, Runner provisioning and durable API sync. */
export class BusinessLiveCoordinator {
  private removeEventListener: (() => void) | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private syncTimer: ReturnType<typeof setTimeout> | null = null
  private initialized = false
  private readonly provisioning = new Set<string>()
  private readonly outbox: BusinessWorkspaceOutbox

  constructor(private readonly dependencies: BusinessLiveDependencies) {
    this.outbox = new BusinessWorkspaceOutbox({
      updateItem: updateBusinessBatchItem,
      updateBatch: updateBusinessBatch,
      finishBatch: finishBusinessBatch,
      onState: state => this.dependencies.setSyncState(state),
    })
  }

  async initialize(): Promise<void> {
    const batch = window.electronAPI?.batch
    if (!this.removeEventListener && batch) this.removeEventListener = batch.onEvent(event => this.handleEvent(event))
    const localSnapshot = await batch?.getSnapshot()
    const parsedLocalSnapshot = businessBatchSnapshotSchema.safeParse(localSnapshot)
    if (parsedLocalSnapshot.success && parsedLocalSnapshot.data.recordKind === 'demo') {
      if (this.dependencies.getSnapshot().status === 'idle') await batch?.cancel('interrupted').catch(() => undefined)
    } else if (localSnapshot) {
      this.dependencies.setSnapshot(businessBatchSnapshotSchema.parse(localSnapshot))
    }
    if (this.initialized) return
    this.initialized = true
    this.startHeartbeat()
    window.addEventListener('online', this.handleReconnect)
    window.addEventListener('focus', this.handleReconnect)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  }

  async start(
    tool: BusinessTool,
    preview: ImportPreview,
    clientBatchId: string,
    maxOpenSessions: number,
  ): Promise<BusinessBatchSnapshot> {
    const serverBatch = serverBatchSchema.parse(unwrapData(await createBusinessBatch({
      client_batch_id: clientBatchId,
      tool_id: String(tool.id),
      tool_name: tool.name,
      total_count: preview.validCount,
    })))
    const localSnapshot = businessBatchSnapshotSchema.parse(await requireBatchApi().create(ipcPayload({
      importId: preview.importId,
      batchId: clientBatchId,
      serverBatchId: serverBatch.id,
      tool,
      maxOpenSessions,
      recordKind: 'live',
    })))
    this.dependencies.setSnapshot(localSnapshot)
    return localSnapshot
  }

  async registerBrowser(itemId: string, webContentsId: number): Promise<void> {
    await requireBatchApi().registerBrowser(itemId, webContentsId)
    await this.startProvisionedItem(itemId)
  }

  selectItem(itemId: string): void {
    void window.electronAPI?.batch?.selectItem(itemId).catch(() => undefined)
  }

  async completeUserAction(itemId: string): Promise<void> {
    this.dependencies.setSnapshot(await requireBatchApi().completeUserAction(itemId))
  }

  async restartItem(itemId: string): Promise<void> {
    this.dependencies.setSnapshot(await requireBatchApi().restartItem(itemId))
  }

  async cancel(status: 'completed' | 'cancelled' | 'interrupted' = 'cancelled'): Promise<void> {
    const serverBatchId = this.dependencies.getSnapshot().serverBatchId
    this.dependencies.setSnapshot(await requireBatchApi().cancel(status))
    if (serverBatchId !== undefined) {
      this.outbox.queueFinish({ batchId: serverBatchId, status })
      await this.flushWithin(1_500)
    }
  }

  async cancelLocal(status: string): Promise<void> {
    await window.electronAPI?.batch?.cancel(status)
    this.provisioning.clear()
  }

  flushWithin(timeoutMs: number): Promise<boolean> {
    return this.outbox.flushWithin(timeoutMs)
  }

  dispose(): void {
    if (this.outbox.hasPending()) void this.flushWithin(1_500)
    this.removeEventListener?.()
    this.removeEventListener = null
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.outbox.dispose()
    this.heartbeatTimer = null
    this.syncTimer = null
    this.initialized = false
    window.removeEventListener('online', this.handleReconnect)
    window.removeEventListener('focus', this.handleReconnect)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
  }

  private readonly handleReconnect = (): void => {
    this.outbox.reconnect()
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') this.handleReconnect()
  }

  private handleEvent(input: unknown): void {
    const parsed = batchEventSchema.safeParse(input)
    if (!parsed.success) return
    const event: BatchEvent = parsed.data
    if (event.snapshot?.recordKind === 'demo') return
    if (event.snapshot) this.dependencies.setSnapshot(event.snapshot)
    if (event.type === 'batch.item_ready' && event.itemId) this.dependencies.selectItem(event.itemId)
    if (event.type === 'batch.item_updated' && event.itemId) this.syncItem(event.itemId)
    if (event.type === 'batch.finished') {
      const finalStatus = event.snapshot?.status === 'completed' ? 'completed' : 'cancelled'
      const serverBatchId = event.snapshot?.serverBatchId
      if (serverBatchId !== undefined) {
        this.outbox.queueFinish({ batchId: serverBatchId, status: finalStatus })
        void this.outbox.flush()
      }
    }
    this.scheduleSummarySync()
  }

  private async startProvisionedItem(itemId: string): Promise<void> {
    const snapshot = this.dependencies.getSnapshot()
    if (this.provisioning.has(itemId) || snapshot.provisioningItemId !== itemId) return
    this.provisioning.add(itemId)
    try {
      const tool = snapshot.tool || this.dependencies.getSelectedTool()
      if (!tool) throw new Error('当前批次缺少工具配置')
      const platformKey = tool.platform_key || tool.platformKey || 'amazon'
      const envelope = launchGrantEnvelopeSchema.parse(await createToolLaunchGrant(tool.id, {
        platformKey,
        deviceId: window.electronAPI?.runtime?.deviceId || localStorage.getItem('toolbox_device_id') || '',
        executionMode: 'batch',
        clientBatchId: snapshot.batchId,
        clientItemId: itemId,
        idempotencyKey: `${snapshot.batchId}:${itemId}`,
      }))
      const grant = envelope.launch_data || envelope.grant || (envelope.token ? launchGrantSchema.parse(envelope) : null)
      if (!grant) throw new Error('批量启动授权不完整')
      await requireBatchApi().start(ipcPayload({
        itemId,
        tool: {
          ...tool,
          platformKey: grant.platform_key || platformKey,
          targetUrl: grant.target_url || tool.target_url || tool.targetUrl,
          executionMode: 'live',
          launchGrant: {
            token: grant.token,
            expiresAt: grant.expires_at || envelope.expires_at,
            expiresIn: envelope.expires_in,
            scriptKey: grant.script_key,
            runnerApiVersion: grant.runner_api_version || 1,
            toolVersion: grant.tool_version || '1.0.0',
            toolManifest: grant.tool_manifest,
            toolSignature: grant.tool_signature,
            signingKeyId: grant.signing_key_id,
            signatureRequired: Boolean(grant.signature_required),
          },
        },
      }))
    } catch (cause) {
      const message = errorMessage(cause, '无法启动该账号')
      this.dependencies.setError(message)
      const failed = await requireBatchApi().failItem({ itemId, message }).catch(() => null)
      if (failed) this.dependencies.setSnapshot(failed)
      throw cause
    } finally {
      this.provisioning.delete(itemId)
    }
  }

  private syncItem(itemId: string): void {
    const snapshot = this.dependencies.getSnapshot()
    const batchId = snapshot.serverBatchId
    const item = snapshot.items.find(candidate => candidate.itemId === itemId)
    if (batchId === undefined || !item) return
    const status = serverBatchItemStatusSchema.safeParse(item.status)
    if (!status.success) return
    const intervention = serverInterventionTypeSchema.safeParse(item.interventionType)
    this.outbox.queueItem({
      batchId,
      itemId,
      payload: {
        account_label_masked: item.accountLabelMasked || '未命名账号',
        status: status.data,
        intervention_type: intervention.success ? intervention.data : item.interventionType ? 'other' : undefined,
        customer_message: item.message || undefined,
      },
    })
  }

  private scheduleSummarySync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => this.syncSummary(), 250)
  }

  private syncSummary(): void {
    const snapshot = this.dependencies.getSnapshot()
    const batchId = snapshot.serverBatchId
    if (snapshot.recordKind === 'demo' || batchId === undefined || snapshot.status === 'idle') return
    const counts = snapshot.counts
    this.outbox.queueBatch({
      batchId,
      payload: {
        status: snapshot.status === 'completed' ? 'completed' : 'running',
        pending_count: counts.pending || 0,
        running_count: counts.running || 0,
        waiting_count: counts.waiting || 0,
        completed_count: counts.completed || 0,
        failed_count: counts.failed || 0,
      },
    })
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return
    this.heartbeatTimer = setInterval(() => {
      if (this.dependencies.getSnapshot().status === 'running') this.syncSummary()
    }, 30_000)
  }
}
