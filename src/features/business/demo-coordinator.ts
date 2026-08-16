import {
  createDemoBatch,
  finishDemoBatch,
  updateDemoBatch,
  updateDemoBatchItem,
} from '@/utils/api'
import { demoBatchSchema, unwrapApiData } from '@/features/demo/model'
import { demoActivityToken, setDemoActivity } from '@/utils/demoActivity'

import {
  DemoConcurrencyController,
  type DemoCompletion,
  type DemoProgressUpdate,
  type DemoSimulatedOutcome,
} from './demo-concurrency'
import {
  businessBatchSnapshotSchema,
  importPreviewSchema,
  type BusinessBatchSnapshot,
  type BusinessTool,
  type ImportPreview,
} from './model'
import { errorMessage, ipcPayload } from './workspace-helpers'
import type { WorkspaceSyncState } from './workspace-outbox'

interface DemoResult {
  status: 'completed' | 'waiting_user' | 'failed'
  message: string
}

export interface BusinessDemoDependencies {
  getSnapshot(): BusinessBatchSnapshot
  setSnapshot(snapshot: BusinessBatchSnapshot): void
  setSyncState(state: WorkspaceSyncState): void
  setError(message: string | null): void
  refreshHistory(): Promise<unknown>
}

/**
 * Coordinates one logical demo batch. It deliberately owns no Pinia state;
 * snapshots flow through callbacks so the store remains the stable facade.
 */
export class BusinessDemoCoordinator {
  private batchEventSequence = 0
  private runToken = 0
  private activeActivityToken: string | null = null
  private summaryQueue: Promise<void> = Promise.resolve()
  private controller: DemoConcurrencyController | null = null
  private readonly itemSequences = new Map<string, number>()

  constructor(private readonly dependencies: BusinessDemoDependencies) {}

  async start(
    tool: BusinessTool,
    preview: ImportPreview,
    clientBatchId: string,
  ): Promise<BusinessBatchSnapshot> {
    try {
      const created = demoBatchSchema.parse(unwrapApiData(await createDemoBatch({
        client_demo_batch_id: `demo_${clientBatchId}`,
        tool_id: String(tool.id),
        tool_name: tool.name,
        platform_key: tool.platform_key || tool.platformKey || 'amazon',
        scenario_id: tool.demo_scenario_id,
        row_count: preview.validCount,
      })))
      const itemRefs = created.items.length
        ? created.items.map(item => item.item_ref)
        : Array.from({ length: created.row_count }, (_, index) => `demo_item_${index + 1}`)
      const batchApi = window.electronAPI?.batch
      const demoTool: BusinessTool = {
        ...tool,
        executionMode: 'demo',
        scriptKey: tool.script_key,
        launchGrant: { scriptKey: tool.script_key },
      }
      let localSnapshot: BusinessBatchSnapshot
      if (batchApi) {
        const localImport = importPreviewSchema.parse(await batchApi.remapImportItems({
          importId: preview.importId,
          itemIds: itemRefs,
        }))
        localSnapshot = businessBatchSnapshotSchema.parse(await batchApi.create(ipcPayload({
          importId: localImport.importId,
          batchId: `demo_${clientBatchId}`,
          serverBatchId: created.id,
          tool: demoTool,
          maxOpenSessions: 0,
          recordKind: 'demo',
        })))
      } else {
        if (itemRefs.length !== preview.rows.length) throw new Error('服务端任务数与本地导入行数不一致')
        localSnapshot = businessBatchSnapshotSchema.parse({
          batchId: `demo_${clientBatchId}`,
          serverBatchId: created.id,
          tool: demoTool,
          status: 'running',
          recordKind: 'demo',
          maxOpenSessions: 0,
          counts: { total: itemRefs.length, pending: itemRefs.length, running: 0, waiting: 0, completed: 0, failed: 0 },
          items: itemRefs.map((itemId, index) => ({
            itemId,
            accountLabelMasked: String(preview.rows[index]?.preview.account_label || `演示账号 ${index + 1}`),
            status: 'pending',
            browserReady: false,
          })),
        })
      }

      const startedAtMs = Date.now()
      const concurrentSnapshot = businessBatchSnapshotSchema.parse({
        ...localSnapshot,
        status: 'running',
        activeItemId: null,
        provisioningItemId: null,
        maxOpenSessions: 0,
        counts: {
          total: localSnapshot.items.length,
          pending: 0,
          running: localSnapshot.items.length,
          waiting: 0,
          completed: 0,
          failed: 0,
        },
        items: localSnapshot.items.map(item => ({
          ...item,
          status: 'running',
          browserReady: false,
          progressPercent: 4,
          stageIndex: 0,
          startedAtMs,
          finishedAtMs: undefined,
          simulatedOutcome: null,
          message: '演示账号已并发启动',
        })),
      })
      this.dependencies.setSnapshot(concurrentSnapshot)
      this.dependencies.setSyncState('syncing')
      this.itemSequences.clear()
      await Promise.all(concurrentSnapshot.items.map(async item => {
        await updateDemoBatchItem(created.id, item.itemId, {
          event_seq: 1,
          status: 'playing',
          simulated_outcome: null,
        })
        this.itemSequences.set(item.itemId, 1)
      }))
      this.batchEventSequence = 1
      await updateDemoBatch(created.id, {
        event_seq: this.batchEventSequence,
        status: 'running',
        queued_count: 0,
        playing_count: concurrentSnapshot.items.length,
        played_count: 0,
        skipped_count: 0,
        error_count: 0,
      })
      this.activeActivityToken = demoActivityToken('batch', created.id)
      await setDemoActivity(this.activeActivityToken, true)
      this.dependencies.setSyncState('synced')
      this.startConcurrency(created.id)
      return concurrentSnapshot
    } catch (cause) {
      this.stopController()
      await this.deactivateActivity()
      throw cause
    }
  }

  async cancel(status: 'completed' | 'cancelled' | 'interrupted' = 'cancelled'): Promise<void> {
    const snapshot = this.dependencies.getSnapshot()
    const serverBatchId = snapshot.serverBatchId
    this.stopController()
    const finishedAtMs = Date.now()
    const unfinishedItems = snapshot.items.filter(item => item.status === 'pending' || item.status === 'running')
    const unfinishedIds = new Set(unfinishedItems.map(item => item.itemId))
    const nextItems = snapshot.items.map(item => unfinishedIds.has(item.itemId)
      ? { ...item, status: 'cancelled', message: '演示已退出', progressPercent: item.progressPercent || 0, finishedAtMs }
      : item)
    const cancelledSnapshot = businessBatchSnapshotSchema.parse({
      ...snapshot,
      status: 'cancelled',
      activeItemId: null,
      provisioningItemId: null,
      items: nextItems,
      counts: this.localCounts(nextItems),
    })
    this.dependencies.setSnapshot(cancelledSnapshot)

    const remoteCancellation = (async () => {
      await this.summaryQueue.catch(() => undefined)
      if (serverBatchId === undefined) return
      await Promise.allSettled(unfinishedItems.map(item => updateDemoBatchItem(serverBatchId, item.itemId, {
        event_seq: Math.max(2, (this.itemSequences.get(item.itemId) || 0) + 1),
        status: 'skipped',
        simulated_outcome: null,
      })))
      this.batchEventSequence += 1
      await updateDemoBatch(serverBatchId, {
        event_seq: this.batchEventSequence,
        status: 'cancelled',
        ...this.serverCounts(nextItems),
      })
    })()
    const [persisted] = await Promise.all([
      this.settleWithin(remoteCancellation, 2_400),
      this.settleWithin(window.electronAPI?.batch?.cancel(status).then(() => undefined) || Promise.resolve(), 1_500),
    ])
    await this.deactivateActivity()
    this.dependencies.setSyncState(persisted ? 'synced' : 'offline')
    if (!persisted) this.dependencies.setError('演示已在本地退出，记录将在网络恢复后刷新')
    else await this.dependencies.refreshHistory().catch(() => undefined)
  }

  async reset(): Promise<void> {
    this.stopController()
    await this.deactivateActivity()
    this.itemSequences.clear()
  }

  dispose(): void {
    this.stopController()
    void this.deactivateActivity()
  }

  private startConcurrency(batchId: string | number): void {
    this.runToken += 1
    const token = this.runToken
    this.summaryQueue = Promise.resolve()
    this.controller?.stop()
    this.controller = new DemoConcurrencyController({
      onProgress: updates => this.applyProgress(updates),
      onItemComplete: completion => this.finishItem(batchId, token, completion),
      onComplete: () => this.completeBatch(batchId, token),
      onError: cause => this.failPlayback(cause),
    })
    this.controller.start(this.dependencies.getSnapshot().items.map(item => item.itemId))
  }

  private applyProgress(updates: DemoProgressUpdate[]): void {
    const snapshot = this.dependencies.getSnapshot()
    if (snapshot.recordKind !== 'demo' || snapshot.status !== 'running') return
    const byId = new Map(updates.map(update => [update.itemId, update]))
    this.dependencies.setSnapshot(businessBatchSnapshotSchema.parse({
      ...snapshot,
      items: snapshot.items.map(item => {
        const update = byId.get(item.itemId)
        return update && item.status === 'running' ? { ...item, ...update } : item
      }),
    }))
  }

  private async finishItem(
    batchId: string | number,
    token: number,
    completion: DemoCompletion,
  ): Promise<void> {
    const snapshot = this.dependencies.getSnapshot()
    if (token !== this.runToken || snapshot.status !== 'running') return
    const serverStatus = completion.outcome === 'failure_example' ? 'error' : 'played'
    await updateDemoBatchItem(batchId, completion.itemId, {
      event_seq: 2,
      status: serverStatus,
      simulated_outcome: completion.outcome,
    })
    const current = this.dependencies.getSnapshot()
    if (token !== this.runToken || current.status !== 'running') return

    this.itemSequences.set(completion.itemId, 2)
    const result = this.resultFor(completion.outcome)
    const nextItems = current.items.map(item => item.itemId === completion.itemId
      ? {
          ...item,
          ...completion,
          status: result.status,
          message: result.message,
          simulatedOutcome: completion.outcome,
        }
      : item)
    this.dependencies.setSnapshot(businessBatchSnapshotSchema.parse({
      ...current,
      items: nextItems,
      counts: this.localCounts(nextItems),
    }))
  }

  private queueSummary(batchId: string | number, token: number, items = this.dependencies.getSnapshot().items): Promise<void> {
    const counts = this.serverCounts(items)
    const request = this.summaryQueue.catch(() => undefined).then(async () => {
      if (token !== this.runToken || this.dependencies.getSnapshot().status !== 'running') return
      this.batchEventSequence += 1
      await updateDemoBatch(batchId, {
        event_seq: this.batchEventSequence,
        status: 'running',
        ...counts,
      })
    })
    this.summaryQueue = request
    return request
  }

  private async completeBatch(batchId: string | number, token: number): Promise<void> {
    if (token !== this.runToken || this.dependencies.getSnapshot().status !== 'running') return
    try {
      await this.queueSummary(batchId, token)
      const snapshot = this.dependencies.getSnapshot()
      if (token !== this.runToken || snapshot.status !== 'running') return
      this.batchEventSequence += 1
      await finishDemoBatch(batchId, { event_seq: this.batchEventSequence })
      this.dependencies.setSnapshot(businessBatchSnapshotSchema.parse({
        ...snapshot,
        status: 'completed',
        activeItemId: null,
        provisioningItemId: null,
        counts: this.localCounts(snapshot.items),
      }))
      this.controller?.stop()
      this.controller = null
      await this.deactivateActivity()
      this.dependencies.setSyncState('synced')
      await this.dependencies.refreshHistory().catch(() => undefined)
    } catch (cause) {
      this.failPlayback(cause)
    }
  }

  private failPlayback(cause: unknown): void {
    this.stopController()
    void this.deactivateActivity()
    this.dependencies.setError(errorMessage(cause, '批量演示同步失败，请重新开始'))
    this.dependencies.setSyncState('offline')
    this.dependencies.setSnapshot(businessBatchSnapshotSchema.parse({
      ...this.dependencies.getSnapshot(),
      status: 'error',
    }))
  }

  private stopController(): void {
    this.runToken += 1
    this.controller?.stop()
    this.controller = null
  }

  private async deactivateActivity(): Promise<void> {
    const token = this.activeActivityToken
    this.activeActivityToken = null
    if (token) await setDemoActivity(token, false)
  }

  private localCounts(items: BusinessBatchSnapshot['items']) {
    return {
      total: items.length,
      pending: items.filter(item => item.status === 'pending').length,
      running: items.filter(item => item.status === 'running').length,
      waiting: items.filter(item => item.status === 'waiting_user').length,
      completed: items.filter(item => item.status === 'completed').length,
      failed: items.filter(item => item.status === 'failed').length,
    }
  }

  private serverCounts(items: BusinessBatchSnapshot['items']) {
    return {
      queued_count: items.filter(item => item.status === 'pending').length,
      playing_count: items.filter(item => item.status === 'running').length,
      played_count: items.filter(item => item.status === 'completed' || item.status === 'waiting_user').length,
      skipped_count: items.filter(item => item.status === 'cancelled').length,
      error_count: items.filter(item => item.status === 'failed').length,
    }
  }

  private resultFor(outcome: DemoSimulatedOutcome): DemoResult {
    if (outcome === 'attention_example') return { status: 'waiting_user', message: '已展示需要关注的人工操作案例' }
    if (outcome === 'failure_example') return { status: 'failed', message: '已展示异常结果案例' }
    return { status: 'completed', message: '已展示完成案例' }
  }

  private async settleWithin(work: Promise<void>, timeoutMs: number): Promise<boolean> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const completed = work.then(() => true, () => false)
    const expired = new Promise<boolean>(resolve => {
      timeout = setTimeout(() => resolve(false), timeoutMs)
    })
    const result = await Promise.race([completed, expired])
    if (timeout) clearTimeout(timeout)
    return result
  }
}
