import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { z } from 'zod'

import {
  createBusinessBatch,
  createDemoBatch,
  createToolLaunchGrant,
  finishDemoBatch,
  finishBusinessBatch,
  getBusinessBootstrap,
  getBusinessBatches,
  getDemoBatches,
  updateDemoBatch,
  updateDemoBatchItem,
  updateBusinessBatch,
  updateBusinessBatchItem,
} from '@/utils/api'
import {
  batchEventSchema,
  businessBatchSnapshotSchema,
  businessBootstrapSchema,
  emptyBatchSnapshot,
  importPreviewSchema,
  launchGrantEnvelopeSchema,
  launchGrantSchema,
  serverBatchSchema,
  serverBatchHistorySchema,
  type BatchEvent,
  type BusinessBatchSnapshot,
  type BusinessBootstrap,
  type BusinessTool,
  type ImportPreview,
  type ServerBatchHistory,
} from '@/features/business/model'
import { demoBatchListSchema, demoBatchSchema, unwrapApiData, type DemoBatch } from '@/features/demo/model'

const STATUS_MESSAGE: Record<string, string> = {
  pending: '等待处理',
  running: '正在处理',
  waiting_user: '需要操作',
  completed: '已完成',
  failed: '未完成',
  cancelled: '已结束',
}

const historySchema = z.array(serverBatchHistorySchema)
const OUTBOX_RETRY_DELAYS = [2_000, 5_000, 15_000, 30_000] as const

interface PendingItemSync {
  batchId: string | number
  itemId: string
  payload: Record<string, unknown>
}

interface PendingBatchSync {
  batchId: string | number
  payload: Record<string, unknown>
}

interface PendingFinishSync {
  batchId: string | number
  status: string
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function unwrapData(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('data' in value)) return value
  return (value as { data: unknown }).data
}

function requireBatchApi() {
  const api = window.electronAPI?.batch
  if (!api) throw new Error('批量工作台仅支持桌面客户端')
  return api
}

export const useBusinessWorkspaceStore = defineStore('businessWorkspace', () => {
  const bootstrap = ref<BusinessBootstrap | null>(null)
  const history = ref<ServerBatchHistory[]>([])
  const demoHistory = ref<DemoBatch[]>([])
  const importPreview = ref<ImportPreview | null>(null)
  const selectedTool = ref<BusinessTool | null>(null)
  const snapshot = ref<BusinessBatchSnapshot>(emptyBatchSnapshot())
  const selectedItemId = ref<string | null>(null)
  const loading = ref(false)
  const syncState = ref<'synced' | 'syncing' | 'offline'>('synced')
  const error = ref<string | null>(null)

  let removeEventListener: (() => void) | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let syncTimer: ReturnType<typeof setTimeout> | null = null
  let outboxRetryTimer: ReturnType<typeof setTimeout> | null = null
  let outboxRetryIndex = 0
  let demoTimer: ReturnType<typeof setTimeout> | null = null
  let demoBatchEventSeq = 0
  let flushingOutbox: Promise<void> | null = null
  const provisioning = new Set<string>()
  const itemOutbox = new Map<string, PendingItemSync>()
  let batchOutbox: PendingBatchSync | null = null
  let finishOutbox: PendingFinishSync | null = null

  const entitlements = computed(() => bootstrap.value?.entitlements || {})
  const tools = computed(() => bootstrap.value?.tools || [])
  const items = computed(() => snapshot.value.items)
  const selectedItem = computed(() => items.value.find(item => item.itemId === selectedItemId.value) || null)
  const isActive = computed(() => snapshot.value.status === 'running')
  const isDemoBatch = computed(() => snapshot.value.recordKind === 'demo')
  const openItems = computed(() => items.value.filter(item =>
    item.browserReady
    || item.itemId === snapshot.value.provisioningItemId
    || item.status === 'running'
    || item.status === 'waiting_user'))

  async function init(): Promise<BusinessBootstrap> {
    if (!bootstrap.value) bootstrap.value = businessBootstrapSchema.parse(await getBusinessBootstrap())
    const batch = window.electronAPI?.batch
    if (!removeEventListener && batch) removeEventListener = batch.onEvent(handleBatchEvent)
    const localSnapshot = await batch?.getSnapshot()
    if (localSnapshot) applySnapshot(localSnapshot)
    startHeartbeat()
    window.addEventListener('online', handleReconnect)
    window.addEventListener('focus', handleReconnect)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return bootstrap.value
  }

  async function refreshBootstrap(): Promise<BusinessBootstrap> {
    loading.value = true
    error.value = null
    try {
      bootstrap.value = businessBootstrapSchema.parse(await getBusinessBootstrap())
      if (selectedTool.value && !bootstrap.value.tools.some(tool => tool.id === selectedTool.value?.id)) {
        selectedTool.value = null
        importPreview.value = null
      }
      return bootstrap.value
    } catch (refreshError) {
      error.value = errorMessage(refreshError, '工作台状态刷新失败')
      throw refreshError
    } finally {
      loading.value = false
    }
  }

  async function loadHistory(): Promise<ServerBatchHistory[]> {
    try {
      history.value = historySchema.parse(await getBusinessBatches({ limit: 30 }))
    } catch (historyError) {
      error.value = errorMessage(historyError, '执行记录暂时无法加载')
    }
    return history.value
  }

  async function loadDemoHistory(): Promise<DemoBatch[]> {
    try {
      demoHistory.value = demoBatchListSchema.parse(await getDemoBatches({ page_size: 30 }))
    } catch (historyError) {
      error.value = errorMessage(historyError, '演示记录暂时无法加载')
      throw historyError
    }
    return demoHistory.value
  }

  function chooseTool(tool: BusinessTool): void {
    if (isActive.value) return
    selectedTool.value = tool
    importPreview.value = null
    error.value = null
  }

  async function selectImportFile(): Promise<ImportPreview> {
    if (!selectedTool.value) throw new Error('请先选择批量工具')
    loading.value = true
    error.value = null
    try {
      if (selectedTool.value.availability === 'demo_only') {
        const validCount = Math.min(entitlements.value.max_batch_rows || 6, 6)
        const payload = {
          importId: `demo_import_${Date.now()}`,
          fileName: '内置演示样例（不含真实客户数据）',
          validCount,
          errorCount: 0,
          rows: Array.from({ length: validCount }, (_, index) => ({
            itemId: `demo_row_${index + 1}`,
            preview: { account_label: `演示项 ${String(index + 1).padStart(2, '0')}` },
          })),
          errors: [],
        }
        importPreview.value = importPreviewSchema.parse(payload)
        return importPreview.value
      }
      const batch = requireBatchApi()
      const payload = await batch.selectImportFile({
        schema: selectedTool.value.batch_input_schema || [],
        maxRows: entitlements.value.max_batch_rows || 50,
      })
      importPreview.value = importPreviewSchema.parse(payload)
      return importPreview.value
    } catch (importError) {
      error.value = errorMessage(importError, '文件导入失败')
      throw importError
    } finally {
      loading.value = false
    }
  }

  async function exportImportErrors(): Promise<unknown> {
    if (!importPreview.value?.errors.length) return null
    if (selectedTool.value?.availability === 'demo_only') return null
    return requireBatchApi().exportImportErrors(importPreview.value.errors)
  }

  async function startBatch(): Promise<BusinessBatchSnapshot> {
    if (!selectedTool.value || !importPreview.value?.validCount) throw new Error('请先导入有效数据')
    const batchId = `batch_${Date.now()}_${cryptoRandom()}`
    loading.value = true
    try {
      if (selectedTool.value.availability === 'demo_only') {
        const created = demoBatchSchema.parse(unwrapApiData(await createDemoBatch({
          client_demo_batch_id: `demo_${batchId}`,
          tool_id: String(selectedTool.value.id),
          tool_name: selectedTool.value.name,
          platform_key: selectedTool.value.platform_key || selectedTool.value.platformKey || 'amazon',
          scenario_id: selectedTool.value.demo_scenario_id,
          row_count: importPreview.value.validCount,
        })))
        demoBatchEventSeq = 1
        await updateDemoBatch(created.id, {
          event_seq: demoBatchEventSeq,
          status: 'running',
          queued_count: created.row_count,
          playing_count: 0,
          played_count: 0,
          skipped_count: 0,
          error_count: 0,
        })
        const itemRefs = created.items?.map(item => item.item_ref)
          || Array.from({ length: created.row_count }, (_, index) => `demo_item_${index + 1}`)
        const localSnapshot = businessBatchSnapshotSchema.parse({
          batchId: `demo_${batchId}`,
          serverBatchId: created.id,
          recordKind: 'demo',
          tool: selectedTool.value,
          status: 'running',
          activeItemId: itemRefs[0] || null,
          counts: { total: created.row_count, pending: created.row_count, running: 0, waiting: 0, completed: 0, failed: 0 },
          items: itemRefs.map((itemRef, index) => ({
            itemId: itemRef,
            accountLabelMasked: `演示项 ${String(index + 1).padStart(2, '0')}`,
            status: 'pending',
            browserReady: false,
          })),
        })
        importPreview.value = null
        applySnapshot(localSnapshot)
        scheduleDemoItem(created.id, 0)
        return localSnapshot
      }
      const serverBatch = serverBatchSchema.parse(unwrapData(await createBusinessBatch({
        client_batch_id: batchId,
        tool_id: selectedTool.value.id,
        tool_name: selectedTool.value.name,
        total_count: importPreview.value.validCount,
      })))
      const localSnapshot = businessBatchSnapshotSchema.parse(await requireBatchApi().create({
        importId: importPreview.value.importId,
        batchId,
        serverBatchId: serverBatch.id,
        tool: selectedTool.value,
        maxOpenSessions: entitlements.value.max_open_sessions || 6,
        recordKind: 'live',
      }))
      importPreview.value = null
      applySnapshot(localSnapshot)
      return localSnapshot
    } finally {
      loading.value = false
    }
  }

  function scheduleDemoItem(batchId: string | number, index: number): void {
    if (demoTimer) clearTimeout(demoTimer)
    const item = snapshot.value.items[index]
    if (!item) {
      demoTimer = setTimeout(() => { void completeDemoBatch(batchId) }, 450)
      return
    }
    demoTimer = setTimeout(() => {
      void (async () => {
        try {
          const completed = snapshot.value.counts.completed || 0
          const total = snapshot.value.counts.total || snapshot.value.items.length
          snapshot.value = businessBatchSnapshotSchema.parse({
            ...snapshot.value,
            activeItemId: item.itemId,
            counts: { ...snapshot.value.counts, pending: Math.max(0, total - completed - 1), running: 1 },
            items: snapshot.value.items.map(candidate => candidate.itemId === item.itemId
              ? { ...candidate, status: 'running' }
              : candidate),
          })
          await updateDemoBatchItem(batchId, item.itemId, { event_seq: 1, status: 'playing' })
          demoBatchEventSeq += 1
          await updateDemoBatch(batchId, {
            event_seq: demoBatchEventSeq,
            status: 'running',
            queued_count: Math.max(0, total - completed - 1),
            playing_count: 1,
            played_count: completed,
            skipped_count: 0,
            error_count: 0,
          })
          demoTimer = setTimeout(() => { void finishDemoItem(batchId, index) }, 700)
        } catch (demoError) {
          failDemoPlayback(demoError)
        }
      })()
    }, 450)
  }

  async function finishDemoItem(batchId: string | number, index: number): Promise<void> {
    const item = snapshot.value.items[index]
    if (!item) return
    try {
      const outcome = index % 4 === 2 ? 'attention_example' : index % 5 === 4 ? 'failure_example' : 'completed_example'
      await updateDemoBatchItem(batchId, item.itemId, {
        event_seq: 2,
        status: 'played',
        simulated_outcome: outcome,
      })
      const completed = (snapshot.value.counts.completed || 0) + 1
      const total = snapshot.value.counts.total || snapshot.value.items.length
      snapshot.value = businessBatchSnapshotSchema.parse({
        ...snapshot.value,
        counts: { ...snapshot.value.counts, pending: Math.max(0, total - completed), running: 0, completed },
        items: snapshot.value.items.map(candidate => candidate.itemId === item.itemId
          ? { ...candidate, status: 'completed', message: outcome === 'attention_example' ? '已展示人工操作案例' : outcome === 'failure_example' ? '已展示异常结果案例' : '已展示完成案例' }
          : candidate),
      })
      demoBatchEventSeq += 1
      await updateDemoBatch(batchId, {
        event_seq: demoBatchEventSeq,
        status: 'running',
        queued_count: Math.max(0, total - completed),
        playing_count: 0,
        played_count: completed,
        skipped_count: 0,
        error_count: 0,
      })
      scheduleDemoItem(batchId, index + 1)
    } catch (demoError) {
      failDemoPlayback(demoError)
    }
  }

  async function completeDemoBatch(batchId: string | number): Promise<void> {
    try {
      demoBatchEventSeq += 1
      await finishDemoBatch(batchId, { event_seq: demoBatchEventSeq })
      snapshot.value = businessBatchSnapshotSchema.parse({ ...snapshot.value, status: 'completed', activeItemId: null })
      syncState.value = 'synced'
      await loadDemoHistory().catch(() => undefined)
    } catch (demoError) {
      failDemoPlayback(demoError)
    }
  }

  function failDemoPlayback(demoError: unknown): void {
    if (demoTimer) clearTimeout(demoTimer)
    demoTimer = null
    error.value = errorMessage(demoError, '批量演示同步失败，请重新开始')
    syncState.value = 'offline'
    snapshot.value = businessBatchSnapshotSchema.parse({ ...snapshot.value, status: 'error' })
  }

  async function registerBrowser(itemId: string, webContentsId: number): Promise<void> {
    await requireBatchApi().registerBrowser(itemId, webContentsId)
    await startProvisionedItem(itemId)
  }

  async function startProvisionedItem(itemId: string): Promise<void> {
    if (provisioning.has(itemId) || snapshot.value.provisioningItemId !== itemId) return
    provisioning.add(itemId)
    try {
      const tool = snapshot.value.tool || selectedTool.value
      if (!tool) throw new Error('当前批次缺少工具配置')
      const platformKey = tool.platform_key || tool.platformKey || 'amazon'
      const envelope = launchGrantEnvelopeSchema.parse(await createToolLaunchGrant(tool.id, {
        platformKey,
        deviceId: localStorage.getItem('toolbox_device_id') || '',
        executionMode: 'batch',
        clientBatchId: snapshot.value.batchId,
        clientItemId: itemId,
        idempotencyKey: `${snapshot.value.batchId}:${itemId}`,
      }))
      const grant = envelope.launch_data || envelope.grant || (envelope.token ? launchGrantSchema.parse(envelope) : null)
      if (!grant) throw new Error('批量启动授权不完整')
      await requireBatchApi().start({
        itemId,
        tool: {
          ...tool,
          platformKey: grant.platform_key || platformKey,
          targetUrl: grant.target_url || tool.target_url || tool.targetUrl,
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
      })
    } catch (startError) {
      error.value = errorMessage(startError, '无法启动该账号')
      const failed = await requireBatchApi().failItem({ itemId, message: error.value }).catch(() => null)
      if (failed) applySnapshot(failed)
      throw startError
    } finally {
      provisioning.delete(itemId)
    }
  }

  function selectItem(itemId: string): void {
    selectedItemId.value = itemId
    void window.electronAPI?.batch?.selectItem(itemId).catch(() => undefined)
  }

  async function completeUserAction(itemId: string): Promise<void> {
    if (isDemoBatch.value) return
    applySnapshot(await requireBatchApi().completeUserAction(itemId))
  }

  async function restartItem(itemId: string): Promise<void> {
    if (isDemoBatch.value) return
    applySnapshot(await requireBatchApi().restartItem(itemId))
  }

  async function cancelBatch(status = 'cancelled'): Promise<void> {
    const serverBatchId = snapshot.value.serverBatchId
    if (isDemoBatch.value) {
      if (demoTimer) clearTimeout(demoTimer)
      demoTimer = null
      if (serverBatchId !== undefined) {
        const total = snapshot.value.counts.total || snapshot.value.items.length
        const played = snapshot.value.counts.completed || 0
        demoBatchEventSeq += 1
        await updateDemoBatch(serverBatchId, {
          event_seq: demoBatchEventSeq,
          status: 'cancelled',
          queued_count: 0,
          playing_count: 0,
          played_count: played,
          skipped_count: Math.max(0, total - played),
          error_count: 0,
        })
      }
      snapshot.value = businessBatchSnapshotSchema.parse({ ...snapshot.value, status: 'cancelled', activeItemId: null })
      return
    }
    applySnapshot(await requireBatchApi().cancel(status))
    if (serverBatchId !== undefined) {
      finishOutbox = { batchId: serverBatchId, status }
      await flushOutboxWithin(1_500)
    }
  }

  async function resetWorkspace(): Promise<void> {
    if (isActive.value) throw new Error('当前批次仍在执行')
    if (demoTimer) clearTimeout(demoTimer)
    demoTimer = null
    if (!isDemoBatch.value) await window.electronAPI?.batch?.cancel(snapshot.value.status || 'completed')
    snapshot.value = emptyBatchSnapshot()
    selectedItemId.value = null
    selectedTool.value = null
    importPreview.value = null
    provisioning.clear()
  }

  function handleBatchEvent(input: unknown): void {
    const parsed = batchEventSchema.safeParse(input)
    if (!parsed.success) return
    const event: BatchEvent = parsed.data
    if (event.snapshot) applySnapshot(event.snapshot)
    if (event.type === 'batch.item_ready' && event.itemId) selectItem(event.itemId)
    if (event.type === 'batch.item_updated' && event.itemId) void syncItem(event.itemId)
    if (event.type === 'batch.finished') {
      const finalStatus = event.snapshot?.status === 'completed' ? 'completed' : 'cancelled'
      const serverBatchId = event.snapshot?.serverBatchId
      if (serverBatchId !== undefined) {
        finishOutbox = { batchId: serverBatchId, status: finalStatus }
        void flushOutbox()
      }
    }
    scheduleSummarySync()
  }

  function applySnapshot(input: unknown): void {
    const parsed = businessBatchSnapshotSchema.safeParse(input)
    if (!parsed.success) return
    snapshot.value = parsed.data
    if (!selectedItemId.value || !snapshot.value.items.some(item => item.itemId === selectedItemId.value)) {
      selectedItemId.value = snapshot.value.activeItemId
        || snapshot.value.provisioningItemId
        || snapshot.value.items[0]?.itemId
        || null
    }
  }

  function syncItem(itemId: string): void {
    const batchId = snapshot.value.serverBatchId
    const item = items.value.find(candidate => candidate.itemId === itemId)
    if (batchId === undefined || !item) return
    itemOutbox.set(itemId, {
      batchId,
      itemId,
      payload: {
        account_label_masked: item.accountLabelMasked,
        status: item.status,
        intervention_type: item.interventionType || undefined,
        customer_message: item.message || undefined,
      },
    })
    void flushOutbox()
  }

  function scheduleSummarySync(): void {
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => { void syncSummary() }, 250)
  }

  function syncSummary(): void {
    const batchId = snapshot.value.serverBatchId
    if (isDemoBatch.value || batchId === undefined || snapshot.value.status === 'idle') return
    const counts = snapshot.value.counts
    batchOutbox = {
      batchId,
      payload: {
        status: snapshot.value.status === 'completed' ? 'completed' : 'running',
        pending_count: counts.pending || 0,
        running_count: counts.running || 0,
        waiting_count: counts.waiting || 0,
        completed_count: counts.completed || 0,
        failed_count: counts.failed || 0,
      },
    }
    void flushOutbox()
  }

  function hasPendingSync(): boolean {
    return itemOutbox.size > 0 || batchOutbox !== null || finishOutbox !== null
  }

  function clearOutboxRetry(): void {
    if (outboxRetryTimer) clearTimeout(outboxRetryTimer)
    outboxRetryTimer = null
  }

  function scheduleOutboxRetry(): void {
    if (outboxRetryTimer || !hasPendingSync()) return
    const delay = OUTBOX_RETRY_DELAYS[Math.min(outboxRetryIndex, OUTBOX_RETRY_DELAYS.length - 1)]
    outboxRetryIndex += 1
    outboxRetryTimer = setTimeout(() => {
      outboxRetryTimer = null
      void flushOutbox()
    }, delay)
  }

  async function flushOutbox(): Promise<void> {
    if (flushingOutbox) return flushingOutbox
    if (!hasPendingSync()) {
      syncState.value = 'synced'
      return
    }
    clearOutboxRetry()
    syncState.value = 'syncing'
    let completedWithoutError = false
    flushingOutbox = (async () => {
      try {
        for (const [key, pending] of [...itemOutbox.entries()]) {
          await updateBusinessBatchItem(pending.batchId, pending.itemId, pending.payload)
          if (itemOutbox.get(key) === pending) itemOutbox.delete(key)
        }
        const pendingBatch = batchOutbox
        if (pendingBatch) {
          await updateBusinessBatch(pendingBatch.batchId, pendingBatch.payload)
          if (batchOutbox === pendingBatch) batchOutbox = null
        }
        const pendingFinish = finishOutbox
        if (pendingFinish) {
          await finishBusinessBatch(pendingFinish.batchId, pendingFinish.status)
          if (finishOutbox === pendingFinish) finishOutbox = null
        }
        outboxRetryIndex = 0
        syncState.value = hasPendingSync() ? 'syncing' : 'synced'
        completedWithoutError = true
      } catch {
        syncState.value = 'offline'
        scheduleOutboxRetry()
      } finally {
        flushingOutbox = null
        if (completedWithoutError && hasPendingSync()) void flushOutbox()
      }
    })()
    return flushingOutbox
  }

  async function flushOutboxWithin(timeoutMs: number): Promise<boolean> {
    await Promise.race([
      flushOutbox(),
      new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
    ])
    return !hasPendingSync()
  }

  function handleReconnect(): void {
    clearOutboxRetry()
    if (hasPendingSync()) void flushOutbox()
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') handleReconnect()
  }

  function startHeartbeat(): void {
    if (heartbeatTimer) return
    heartbeatTimer = setInterval(() => {
      if (isActive.value) syncSummary()
    }, 30000)
  }

  function dispose(): void {
    if (hasPendingSync()) void flushOutboxWithin(1_500)
    removeEventListener?.()
    removeEventListener = null
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    if (syncTimer) clearTimeout(syncTimer)
    clearOutboxRetry()
    if (demoTimer) clearTimeout(demoTimer)
    demoTimer = null
    heartbeatTimer = null
    syncTimer = null
    window.removeEventListener('online', handleReconnect)
    window.removeEventListener('focus', handleReconnect)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }

  const statusText = (status: string): string => STATUS_MESSAGE[status] || status

  return {
    bootstrap, history, demoHistory, importPreview, selectedTool, snapshot, selectedItemId, selectedItem, loading, syncState, error,
    entitlements, tools, items, openItems, isActive, isDemoBatch,
    init, refreshBootstrap, loadHistory, loadDemoHistory, chooseTool, selectImportFile, exportImportErrors, startBatch, registerBrowser, selectItem,
    completeUserAction, restartItem, cancelBatch, resetWorkspace, statusText, flushOutboxWithin, dispose,
  }
})

function cryptoRandom(): string {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint32Array(2)
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes, value => value.toString(16)).join('')
  }
  return Math.random().toString(16).slice(2)
}
