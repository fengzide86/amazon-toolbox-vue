import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { z } from 'zod'

import {
  getBusinessBootstrap,
  getBusinessBatches,
  getDemoBatches,
} from '@/utils/api'
import {
  businessBatchSnapshotSchema,
  businessBootstrapSchema,
  emptyBatchSnapshot,
  serverBatchHistorySchema,
  type BusinessBatchSnapshot,
  type BusinessBootstrap,
  type BusinessTool,
  type ImportPreview,
  type ServerBatchHistory,
} from '@/features/business/model'
import { demoBatchListSchema, unwrapApiData, type DemoBatch } from '@/features/demo/model'
import { BusinessDemoCoordinator } from '@/features/business/demo-coordinator'
import { BusinessLiveCoordinator } from '@/features/business/live-coordinator'
import { WorkspaceImportCoordinator } from '@/features/business/workspace-import'
import { createClientBatchId, errorMessage, statusText } from '@/features/business/workspace-helpers'
import { getRuntimeCapabilities } from '@/runtime/capabilities'

const historySchema = z.array(serverBatchHistorySchema)

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
  const bootstrapStale = ref(false)
  const historyLoading = ref(false)
  const historyError = ref<string | null>(null)

  const entitlements = computed(() => bootstrap.value?.entitlements || {})
  const tools = computed(() => bootstrap.value?.tools || [])
  const items = computed(() => snapshot.value.items)
  const selectedItem = computed(() => items.value.find(item => item.itemId === selectedItemId.value) || null)
  const isActive = computed(() => snapshot.value.status === 'running')
  const isDemoBatch = computed(() => snapshot.value.recordKind === 'demo')
  const openItems = computed(() => isDemoBatch.value ? [] : items.value.filter(item =>
    item.browserReady
    || item.itemId === snapshot.value.provisioningItemId
    || item.status === 'running'
    || item.status === 'waiting_user'))

  const imports = new WorkspaceImportCoordinator({
    getSelectedTool: () => selectedTool.value,
    getMaxRows: () => entitlements.value.max_batch_rows || 50,
    getPreview: () => importPreview.value,
    setPreview: value => { importPreview.value = value },
    setLoading: value => { loading.value = value },
    setError: value => { error.value = value },
  })
  const demo = new BusinessDemoCoordinator({
    getSnapshot: () => snapshot.value,
    setSnapshot: value => applySnapshot(value),
    setSyncState: value => { syncState.value = value },
    setError: value => { error.value = value },
    refreshHistory: () => loadDemoHistory(),
  })
  const live = new BusinessLiveCoordinator({
    getSnapshot: () => snapshot.value,
    setSnapshot: value => applySnapshot(value),
    getSelectedTool: () => selectedTool.value,
    selectItem: itemId => selectItem(itemId),
    setSyncState: value => { syncState.value = value },
    setError: value => { error.value = value },
  })

  async function init(): Promise<BusinessBootstrap> {
    if (!bootstrap.value) bootstrap.value = businessBootstrapSchema.parse(await getBusinessBootstrap())
    await live.initialize()
    return bootstrap.value
  }

  async function refreshBootstrap(): Promise<BusinessBootstrap> {
    loading.value = true
    error.value = null
    bootstrapStale.value = false
    try {
      bootstrap.value = businessBootstrapSchema.parse(await getBusinessBootstrap())
      if (selectedTool.value && !bootstrap.value.tools.some(tool => tool.id === selectedTool.value?.id)) {
        selectedTool.value = null
        importPreview.value = null
      }
      return bootstrap.value
    } catch (cause) {
      error.value = errorMessage(cause, '工作台状态刷新失败')
      bootstrapStale.value = bootstrap.value !== null
      throw cause
    } finally {
      loading.value = false
    }
  }

  async function loadHistory(): Promise<ServerBatchHistory[]> {
    historyLoading.value = true
    historyError.value = null
    try {
      history.value = historySchema.parse(await getBusinessBatches({ limit: 30 }))
    } catch (cause) {
      historyError.value = errorMessage(cause, '执行记录暂时无法加载')
      throw cause
    } finally {
      historyLoading.value = false
    }
    return history.value
  }

  async function loadDemoHistory(): Promise<DemoBatch[]> {
    historyLoading.value = true
    historyError.value = null
    try {
      demoHistory.value = demoBatchListSchema.parse(unwrapApiData(await getDemoBatches({ page_size: 30 })))
    } catch (cause) {
      historyError.value = errorMessage(cause, '演示记录暂时无法加载')
      throw cause
    } finally {
      historyLoading.value = false
    }
    return demoHistory.value
  }

  function chooseTool(tool: BusinessTool): void {
    if (isActive.value) return
    selectedTool.value = tool
    importPreview.value = null
    error.value = null
  }

  function loadSampleImport(): Promise<ImportPreview> {
    return imports.loadSample()
  }

  function saveSampleTemplate() {
    return imports.saveSampleTemplate()
  }

  function selectImportFile(): Promise<ImportPreview> {
    return imports.selectFile()
  }

  function exportImportErrors() {
    return imports.exportErrors()
  }

  async function startBatch(): Promise<BusinessBatchSnapshot> {
    const tool = selectedTool.value
    const preview = importPreview.value
    if (!tool || !preview?.validCount) throw new Error('请先导入有效数据')
    if (tool.availability !== 'demo_only' && !getRuntimeCapabilities().batchLive) {
      throw new Error('真实批量执行仅支持课赛通 KST 桌面端')
    }
    const batchId = createClientBatchId()
    loading.value = true
    try {
      const nextSnapshot = tool.availability === 'demo_only'
        ? await demo.start(tool, preview, batchId)
        : await live.start(tool, preview, batchId, entitlements.value.max_open_sessions || 6)
      importPreview.value = null
      return nextSnapshot
    } catch (cause) {
      error.value = errorMessage(cause, '无法开始批次')
      throw cause
    } finally {
      loading.value = false
    }
  }

  async function registerBrowser(itemId: string, webContentsId: number): Promise<void> {
    if (isDemoBatch.value) return
    await live.registerBrowser(itemId, webContentsId)
  }

  function selectItem(itemId: string): void {
    selectedItemId.value = itemId
    live.selectItem(itemId)
  }

  async function completeUserAction(itemId: string): Promise<void> {
    if (isDemoBatch.value) return
    await live.completeUserAction(itemId)
  }

  async function restartItem(itemId: string): Promise<void> {
    if (isDemoBatch.value) return
    await live.restartItem(itemId)
  }

  async function cancelBatch(status: 'completed' | 'cancelled' | 'interrupted' = 'cancelled'): Promise<void> {
    if (isDemoBatch.value) await demo.cancel(status)
    else await live.cancel(status)
  }

  async function resetWorkspace(): Promise<void> {
    if (isActive.value) throw new Error('当前批次仍在执行')
    await demo.reset()
    await live.cancelLocal(snapshot.value.status || 'completed')
    snapshot.value = emptyBatchSnapshot()
    selectedItemId.value = null
    selectedTool.value = null
    importPreview.value = null
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

  function flushOutboxWithin(timeoutMs: number): Promise<boolean> {
    return live.flushWithin(timeoutMs)
  }

  function dispose(): void {
    live.dispose()
    demo.dispose()
  }

  return {
    bootstrap, history, demoHistory, importPreview, selectedTool, snapshot, selectedItemId, selectedItem, loading, syncState, error, bootstrapStale, historyLoading, historyError,
    entitlements, tools, items, openItems, isActive, isDemoBatch,
    init, refreshBootstrap, loadHistory, loadDemoHistory, chooseTool, loadSampleImport, saveSampleTemplate, selectImportFile, exportImportErrors, startBatch, registerBrowser, selectItem,
    completeUserAction, restartItem, cancelBatch, resetWorkspace, statusText, flushOutboxWithin, dispose,
  }
})
