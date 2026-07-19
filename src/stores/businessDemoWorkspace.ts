import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  businessBatchSnapshotSchema,
  businessBootstrapSchema,
  type BusinessBatchSnapshot,
  type BusinessBootstrap,
  type BusinessTool,
  type ImportPreview,
  type ServerBatchHistory,
} from '@/features/business/model'
import { demoBatchListSchema, demoBatchSchema, unwrapApiData, type DemoBatch } from '@/features/demo/model'
import {
  createDemoBatch,
  finishDemoBatch,
  getBusinessBootstrap,
  getDemoBatches,
  updateDemoBatch,
  updateDemoBatchItem,
} from '@/utils/api'
import { demoActivityToken, setDemoActivity } from '@/utils/demoActivity'
import { chooseLocalDemoSpreadsheet, parseLocalDemoSpreadsheet } from '@/features/demo/localSpreadsheet'

const DEMO_ITEM_DELAY = 850

const STATUS_MESSAGE: Record<string, string> = {
  queued: '等待演示',
  pending: '等待演示',
  playing: '正在演示',
  running: '正在演示',
  played: '演示完成',
  completed: '演示完成',
  skipped: '已跳过',
  cancelled: '已结束',
  error: '演示异常',
  failed: '演示异常',
}

function demoId(prefix: string): string {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`
  return `${prefix}_${randomPart}`
}

function sanitizeBootstrap(input: unknown): BusinessBootstrap {
  const parsed = businessBootstrapSchema.parse(unwrapApiData(input))
  return {
    ...parsed,
    tools: parsed.tools.map(tool => ({
      ...tool,
      availability: 'demo_only' as const,
      supports_demo_batch: true,
      supports_live_batch: false,
      target_url: undefined,
      targetUrl: undefined,
    })),
  }
}

export const useBusinessDemoWorkspaceStore = defineStore('businessDemoWorkspace', () => {
  const bootstrap = ref<BusinessBootstrap | null>(null)
  const history = ref<ServerBatchHistory[]>([])
  const demoHistory = ref<DemoBatch[]>([])
  const importPreview = ref<ImportPreview | null>(null)
  const selectedTool = ref<BusinessTool | null>(null)
  const snapshot = ref<BusinessBatchSnapshot>(businessBatchSnapshotSchema.parse({
    status: 'idle',
    recordKind: 'demo',
    items: [],
    counts: {},
  }))
  const selectedItemId = ref<string | null>(null)
  const loading = ref(false)
  const syncState = ref<'synced' | 'syncing' | 'offline'>('synced')
  const error = ref<string | null>(null)
  const bootstrapStale = ref(false)

  let playbackTimer: ReturnType<typeof setTimeout> | null = null
  let batchEventSeq = 0
  let playbackToken = 0
  let activeDemoToken: string | null = null

  const entitlements = computed(() => bootstrap.value?.entitlements || {})
  const tools = computed(() => bootstrap.value?.tools || [])
  const items = computed(() => snapshot.value.items)
  const selectedItem = computed(() => items.value.find(item => item.itemId === selectedItemId.value) || null)
  const isActive = computed(() => snapshot.value.status === 'running')
  const isDemoBatch = computed(() => true)
  const openItems = computed(() => [])

  async function init(): Promise<BusinessBootstrap> {
    if (bootstrap.value) return bootstrap.value
    return refreshBootstrap()
  }

  async function refreshBootstrap(): Promise<BusinessBootstrap> {
    loading.value = true
    error.value = null
    bootstrapStale.value = false
    try {
      const next = sanitizeBootstrap(await getBusinessBootstrap())
      bootstrap.value = next
      if (selectedTool.value) {
        selectedTool.value = next.tools.find(tool => String(tool.id) === String(selectedTool.value?.id)) || null
      }
      return next
    } catch (cause) {
      error.value = cause instanceof Error && cause.message ? cause.message : '演示工作台暂时无法载入'
      bootstrapStale.value = bootstrap.value !== null
      throw cause
    } finally {
      loading.value = false
    }
  }

  async function loadDemoHistory(): Promise<DemoBatch[]> {
    loading.value = true
    error.value = null
    try {
      demoHistory.value = demoBatchListSchema.parse(unwrapApiData(await getDemoBatches({ page_size: 100 })))
      return demoHistory.value
    } catch (cause) {
      error.value = cause instanceof Error && cause.message ? cause.message : '演示记录暂时无法载入'
      throw cause
    } finally {
      loading.value = false
    }
  }

  async function loadHistory(): Promise<ServerBatchHistory[]> {
    // 内部测试版没有真实批量执行入口，也不会读取真实执行记录。
    history.value = []
    return history.value
  }

  function chooseTool(tool: BusinessTool): void {
    selectedTool.value = tools.value.find(item => String(item.id) === String(tool.id)) || null
    importPreview.value = null
  }

  async function selectImportFile(): Promise<ImportPreview | null> {
    if (!selectedTool.value) throw new Error('请先选择演示工具')
    const file = await chooseLocalDemoSpreadsheet()
    if (!file) return importPreview.value
    loading.value = true
    error.value = null
    try {
      const maxRows = Number(entitlements.value.max_batch_rows || 50)
      importPreview.value = await parseLocalDemoSpreadsheet(file, selectedTool.value.batch_input_schema, maxRows)
      return importPreview.value
    } catch (cause) {
      error.value = cause instanceof Error && cause.message ? cause.message : 'Excel 演示表格解析失败'
      throw cause
    } finally {
      loading.value = false
    }
  }

  async function exportImportErrors(): Promise<{ count: number } | null> {
    const problems = importPreview.value?.errors || []
    if (!problems.length || typeof document === 'undefined') return null
    const escapeCell = (value: unknown): string => {
      const safe = String(value ?? '').replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')
      return `"${safe}"`
    }
    const csv = ['行号,问题', ...problems.map(problem => `${Number(problem.rowNumber || 0)},${escapeCell(problem.message)}`)].join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = '演示表格问题清单.csv'
    link.click()
    URL.revokeObjectURL(url)
    return { count: problems.length }
  }

  async function startBatch(): Promise<BusinessBatchSnapshot> {
    if (!selectedTool.value) throw new Error('请先选择演示工具')
    if (!importPreview.value?.validCount) throw new Error('请先导入 Excel 演示表格')

    stopPlayback()
    await deactivateDemoActivity()
    loading.value = true
    error.value = null
    syncState.value = 'syncing'
    const clientId = demoId('demo_batch_client')
    try {
      const created = demoBatchSchema.parse(unwrapApiData(await createDemoBatch({
        client_demo_batch_id: clientId,
        tool_id: String(selectedTool.value.id),
        tool_name: selectedTool.value.name,
        platform_key: selectedTool.value.platform_key || selectedTool.value.platformKey || 'amazon',
        scenario_id: selectedTool.value.demo_scenario_id || 'default',
        row_count: importPreview.value.validCount,
      })))
      const serverItems = created.items || []
      if (serverItems.length !== importPreview.value.validCount) throw new Error('演示批次返回的项目数量不完整')

      batchEventSeq = 1
      await updateDemoBatch(created.id, {
        event_seq: batchEventSeq,
        status: 'running',
        queued_count: created.row_count,
        playing_count: 0,
        played_count: 0,
        skipped_count: 0,
        error_count: 0,
      })

      snapshot.value = businessBatchSnapshotSchema.parse({
        batchId: String(created.id),
        serverBatchId: created.id,
        tool: selectedTool.value,
        status: 'running',
        recordKind: 'demo',
        activeItemId: serverItems[0]?.item_ref || null,
        counts: { total: created.row_count, pending: created.row_count, running: 0, waiting: 0, completed: 0, failed: 0 },
        items: serverItems.map((item, index) => ({
          itemId: item.item_ref,
          accountLabelMasked: String(importPreview.value?.rows[index]?.preview.account_label || `演示账号 ${index + 1}`),
          status: 'pending',
          message: '这是本地表格生成的演示项，不代表真实平台处理结果',
          browserReady: false,
        })),
      })
      selectedItemId.value = snapshot.value.items[0]?.itemId || null
      activeDemoToken = demoActivityToken('batch', created.id)
      await setDemoActivity(activeDemoToken, true)
      syncState.value = 'synced'
      const token = ++playbackToken
      scheduleItem(created.id, 0, token)
      return snapshot.value
    } catch (cause) {
      syncState.value = 'offline'
      error.value = cause instanceof Error && cause.message ? cause.message : '批量演示启动失败'
      throw cause
    } finally {
      loading.value = false
    }
  }

  function scheduleItem(batchId: string | number, index: number, token: number): void {
    if (token !== playbackToken || snapshot.value.status !== 'running') return
    if (index >= snapshot.value.items.length) {
      void completeBatch(batchId, token)
      return
    }
    playbackTimer = setTimeout(() => { void playItem(batchId, index, token) }, index === 0 ? 300 : DEMO_ITEM_DELAY)
  }

  async function playItem(batchId: string | number, index: number, token: number): Promise<void> {
    if (token !== playbackToken || snapshot.value.status !== 'running') return
    const item = snapshot.value.items[index]
    if (!item) return
    try {
      syncState.value = 'syncing'
      await updateDemoBatchItem(batchId, item.itemId, { event_seq: 1, status: 'playing', simulated_outcome: null })
      batchEventSeq += 1
      await updateDemoBatch(batchId, {
        event_seq: batchEventSeq,
        status: 'running',
        queued_count: snapshot.value.items.length - index - 1,
        playing_count: 1,
        played_count: index,
        skipped_count: 0,
        error_count: 0,
      })
      patchItem(index, 'running', '正在播放模拟步骤')
      snapshot.value = businessBatchSnapshotSchema.parse({
        ...snapshot.value,
        activeItemId: item.itemId,
        counts: { total: snapshot.value.items.length, pending: snapshot.value.items.length - index - 1, running: 1, waiting: 0, completed: index, failed: 0 },
      })
      selectedItemId.value = item.itemId
      syncState.value = 'synced'
      playbackTimer = setTimeout(() => { void finishItem(batchId, index, token) }, DEMO_ITEM_DELAY)
    } catch (cause) {
      failPlayback(cause)
    }
  }

  async function finishItem(batchId: string | number, index: number, token: number): Promise<void> {
    if (token !== playbackToken || snapshot.value.status !== 'running') return
    const item = snapshot.value.items[index]
    if (!item) return
    try {
      syncState.value = 'syncing'
      await updateDemoBatchItem(batchId, item.itemId, {
        event_seq: 2,
        status: 'played',
        simulated_outcome: 'completed_example',
      })
      batchEventSeq += 1
      await updateDemoBatch(batchId, {
        event_seq: batchEventSeq,
        status: 'running',
        queued_count: snapshot.value.items.length - index - 1,
        playing_count: 0,
        played_count: index + 1,
        skipped_count: 0,
        error_count: 0,
      })
      patchItem(index, 'completed', '模拟步骤已播放完成；不代表真实平台操作成功')
      snapshot.value = businessBatchSnapshotSchema.parse({
        ...snapshot.value,
        counts: { total: snapshot.value.items.length, pending: snapshot.value.items.length - index - 1, running: 0, waiting: 0, completed: index + 1, failed: 0 },
      })
      syncState.value = 'synced'
      scheduleItem(batchId, index + 1, token)
    } catch (cause) {
      failPlayback(cause)
    }
  }

  async function completeBatch(batchId: string | number, token: number): Promise<void> {
    if (token !== playbackToken || snapshot.value.status !== 'running') return
    try {
      syncState.value = 'syncing'
      batchEventSeq += 1
      const completed = demoBatchSchema.parse(unwrapApiData(await finishDemoBatch(batchId, { event_seq: batchEventSeq })))
      snapshot.value = businessBatchSnapshotSchema.parse({
        ...snapshot.value,
        status: 'completed',
        activeItemId: null,
        counts: { total: completed.row_count, pending: 0, running: 0, waiting: 0, completed: completed.played_count, failed: completed.error_count },
      })
      await deactivateDemoActivity()
      syncState.value = 'synced'
      void loadDemoHistory().catch(() => {})
    } catch (cause) {
      failPlayback(cause)
    }
  }

  function patchItem(index: number, status: string, message: string): void {
    const next = [...snapshot.value.items]
    const current = next[index]
    if (!current) return
    next[index] = { ...current, status, message }
    snapshot.value = businessBatchSnapshotSchema.parse({ ...snapshot.value, items: next })
  }

  function failPlayback(cause: unknown): void {
    stopPlayback()
    void deactivateDemoActivity()
    syncState.value = 'offline'
    error.value = cause instanceof Error && cause.message ? cause.message : '演示播放中断'
    snapshot.value = businessBatchSnapshotSchema.parse({ ...snapshot.value, status: 'error' })
  }

  function selectItem(itemId: string): void {
    if (items.value.some(item => item.itemId === itemId)) selectedItemId.value = itemId
  }

  async function completeUserAction(_itemId?: string): Promise<void> {
    // 演示版不会进入需要真实用户干预的状态。
  }

  async function restartItem(_itemId?: string): Promise<void> {
    throw new Error('演示异常后请新建批次重新播放')
  }

  async function cancelBatch(status = 'cancelled'): Promise<void> {
    stopPlayback()
    const batchId = snapshot.value.serverBatchId || snapshot.value.batchId
    if (batchId && snapshot.value.status === 'running') {
      batchEventSeq += 1
      await updateDemoBatch(batchId, {
        event_seq: batchEventSeq,
        status: status === 'error' ? 'error' : 'cancelled',
        queued_count: snapshot.value.counts.pending || 0,
        playing_count: snapshot.value.counts.running || 0,
        played_count: snapshot.value.counts.completed || 0,
        skipped_count: 0,
        error_count: snapshot.value.counts.failed || 0,
      }).catch(() => {})
    }
    snapshot.value = businessBatchSnapshotSchema.parse({ ...snapshot.value, status: 'cancelled', activeItemId: null })
    await deactivateDemoActivity()
    syncState.value = 'synced'
  }

  async function resetWorkspace(): Promise<void> {
    if (isActive.value) await cancelBatch()
    stopPlayback()
    snapshot.value = businessBatchSnapshotSchema.parse({ status: 'idle', recordKind: 'demo', items: [], counts: {} })
    importPreview.value = null
    selectedItemId.value = null
    error.value = null
  }

  function stopPlayback(): void {
    playbackToken += 1
    if (playbackTimer) clearTimeout(playbackTimer)
    playbackTimer = null
  }

  async function deactivateDemoActivity(): Promise<void> {
    const token = activeDemoToken
    activeDemoToken = null
    if (token) await setDemoActivity(token, false)
  }

  function registerBrowser(): void {
    // Kept as a no-op compatibility seam for the demo-only workspace UI.
  }

  function dispose(): void {
    stopPlayback()
    void deactivateDemoActivity()
  }

  const statusText = (status: string): string => STATUS_MESSAGE[status] || status

  return {
    bootstrap,
    history,
    demoHistory,
    importPreview,
    selectedTool,
    snapshot,
    selectedItemId,
    loading,
    syncState,
    error,
    bootstrapStale,
    entitlements,
    tools,
    items,
    selectedItem,
    isActive,
    isDemoBatch,
    openItems,
    init,
    refreshBootstrap,
    loadHistory,
    loadDemoHistory,
    chooseTool,
    selectImportFile,
    exportImportErrors,
    startBatch,
    selectItem,
    completeUserAction,
    restartItem,
    cancelBatch,
    resetWorkspace,
    registerBrowser,
    dispose,
    statusText,
  }
})
