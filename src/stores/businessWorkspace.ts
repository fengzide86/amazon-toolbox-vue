import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { z } from 'zod'

import {
  getBusinessBootstrap,
  getBusinessBatches,
  getDemoBatchesPage,
  getDemoBatch,
  updateDemoBatch,
} from '@/utils/api'
import { authService } from '@/utils/auth'
import { getApiBase } from '@/shared/api/base'
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
import type { DemoBatch } from '@/features/demo/model'
import { demoHistoryPageSchema } from '@/features/business/history'
import { BusinessDemoCoordinator } from '@/features/business/demo-coordinator'
import { DemoBatchRecovery } from '@/features/business/demo-recovery'
import { BusinessLiveCoordinator } from '@/features/business/live-coordinator'
import { WorkspaceImportCoordinator } from '@/features/business/workspace-import'
import { createClientBatchId, errorMessage, statusText } from '@/features/business/workspace-helpers'
import { getRuntimeCapabilities } from '@/runtime/capabilities'
import { readSourceRows, saveSourceRows } from '@/features/business/source-rows'

const historySchema = z.array(serverBatchHistorySchema)

export const useBusinessWorkspaceStore = defineStore('businessWorkspace', () => {
  const bootstrap = ref<BusinessBootstrap | null>(null)
  const history = ref<ServerBatchHistory[]>([])
  const demoHistory = ref<DemoBatch[]>([])
  const demoHistoryTotal = ref(0)
  const demoHistoryPage = ref(0)
  const liveHistoryHasMore = ref(false)
  let liveHistoryOffset = 0
  const historyPageSize = 20
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
  const recoveryPending = ref(0)
  const recoveryStorageUnavailable = ref(false)
  const liveStorageUnavailable = ref(false)
  let historyRequestSequence = 0
  let startRequestSequence = 0
  let pendingStartMode: 'demo' | 'live' | null = null
  let initializedOwnerScope: string | null | undefined
  let bootstrapRequestSequence = 0
  let bootstrapInitialization: { owner: string | null; promise: Promise<BusinessBootstrap> } | null = null

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
    getMaxRows: () => selectedTool.value?.availability === 'demo_only'
      ? 50
      : entitlements.value.max_batch_rows || 50,
    getPreview: () => importPreview.value,
    setPreview: value => { importPreview.value = value },
    setLoading: value => { loading.value = value },
    setError: value => { error.value = value },
  })
  function getOwnerScope(): string | null {
    const user = authService.getUser()
    const owner = user?.user_id ?? user?.id
    if (!authService.getAuth() || authService.getRole() !== 'user' || owner === undefined) return null
    return JSON.stringify([getApiBase(), owner, user?.auth_code_id ?? null, user?.device_id ?? null])
  }

  const recovery = new DemoBatchRecovery({
    scope: getOwnerScope,
    storage: () => localStorage,
    getBatch: getDemoBatch,
    updateBatch: updateDemoBatch,
    onChange: (count, unavailable) => {
      recoveryPending.value = count
      recoveryStorageUnavailable.value = unavailable
    },
    onRecovered: id => {
      if (String(snapshot.value.serverBatchId) === id && !isActive.value) syncState.value = 'synced'
      void loadDemoHistory().catch(() => undefined)
    },
  })
  const demo = new BusinessDemoCoordinator({
    recovery,
    getSnapshot: () => snapshot.value,
    setSnapshot: value => applySnapshot(value),
    setSyncState: value => { syncState.value = value },
    setError: value => { error.value = value },
    refreshHistory: () => loadDemoHistory(),
  })
  const live = new BusinessLiveCoordinator({
    getOwnerScope,
    getSnapshot: () => snapshot.value,
    setSnapshot: value => applySnapshot(value),
    getSelectedTool: () => selectedTool.value,
    selectItem: itemId => selectItem(itemId),
    setSyncState: value => { syncState.value = value },
    setError: value => { error.value = value },
    setStorageUnavailable: value => { liveStorageUnavailable.value = value },
  })

  async function init(): Promise<BusinessBootstrap> {
    const owner = getOwnerScope()
    if (initializedOwnerScope !== undefined && owner !== initializedOwnerScope) {
      startRequestSequence += 1
      bootstrapRequestSequence += 1
      historyRequestSequence += 1
      pendingStartMode = null
      demo.dispose()
      imports.invalidate()
      bootstrap.value = null
      history.value = []
      demoHistory.value = []
      demoHistoryTotal.value = 0
      demoHistoryPage.value = 0
      liveHistoryHasMore.value = false
      liveHistoryOffset = 0
      importPreview.value = null
      selectedTool.value = null
      selectedItemId.value = null
      snapshot.value = emptyBatchSnapshot()
      loading.value = false
      historyLoading.value = false
      error.value = null
      historyError.value = null
      bootstrapStale.value = false
      liveStorageUnavailable.value = false
    }
    initializedOwnerScope = owner
    recovery.initialize()
    if (!bootstrap.value) {
      // The shell and workspace mount together. They must share initialization,
      // not invalidate each other's identical request as an authorization change.
      if (!bootstrapInitialization || bootstrapInitialization.owner !== owner) {
        const requestSequence = ++bootstrapRequestSequence
        error.value = null
        const promise = getBusinessBootstrap().then(response => {
          const nextBootstrap = businessBootstrapSchema.parse(response)
          if (owner !== getOwnerScope() || requestSequence !== bootstrapRequestSequence) {
            throw new Error('授权已切换，请重新打开工作台')
          }
          bootstrap.value = nextBootstrap
          return nextBootstrap
        }).catch(cause => {
          if (owner === getOwnerScope() && requestSequence === bootstrapRequestSequence) {
            error.value = errorMessage(cause, '工作台暂时无法载入，请重试')
          }
          throw cause
        }).finally(() => {
          if (bootstrapInitialization?.promise === promise) bootstrapInitialization = null
        })
        bootstrapInitialization = { owner, promise }
      }
      await bootstrapInitialization.promise
    }
    await live.initialize()
    if (owner !== getOwnerScope() || !bootstrap.value) throw new Error('授权已切换，请重新打开工作台')
    return bootstrap.value
  }

  async function refreshBootstrap(): Promise<BusinessBootstrap> {
    const owner = getOwnerScope()
    const requestSequence = ++bootstrapRequestSequence
    loading.value = true
    error.value = null
    bootstrapStale.value = false
    try {
      const nextBootstrap = businessBootstrapSchema.parse(await getBusinessBootstrap())
      if (owner !== getOwnerScope() || requestSequence !== bootstrapRequestSequence) {
        throw new Error('工作台状态已刷新，请使用最新状态')
      }
      bootstrap.value = nextBootstrap
      if (selectedTool.value && !bootstrap.value.tools.some(tool => tool.id === selectedTool.value?.id)) {
        selectedTool.value = null
        importPreview.value = null
      }
      return bootstrap.value
    } catch (cause) {
      if (owner === getOwnerScope() && requestSequence === bootstrapRequestSequence) {
        error.value = errorMessage(cause, '工作台状态刷新失败')
        bootstrapStale.value = bootstrap.value !== null
      }
      throw cause
    } finally {
      if (owner === getOwnerScope() && requestSequence === bootstrapRequestSequence) loading.value = false
    }
  }

  async function loadHistory(append = false): Promise<ServerBatchHistory[]> {
    const requestSequence = ++historyRequestSequence
    const owner = getOwnerScope()
    historyLoading.value = true
    historyError.value = null
    try {
      const offset = append ? liveHistoryOffset : 0
      const nextHistory = historySchema.parse(await getBusinessBatches({ limit: historyPageSize, offset }))
      if (requestSequence === historyRequestSequence && owner === getOwnerScope()) {
        history.value = append ? [...new Map([...history.value, ...nextHistory].map(batch => [String(batch.id), batch])).values()] : nextHistory
        liveHistoryHasMore.value = nextHistory.length === historyPageSize
        liveHistoryOffset = offset + nextHistory.length
      }
    } catch (cause) {
      if (requestSequence === historyRequestSequence && owner === getOwnerScope()) historyError.value = errorMessage(cause, '执行记录暂时无法加载')
      throw cause
    } finally {
      if (requestSequence === historyRequestSequence) historyLoading.value = false
    }
    return history.value
  }

  async function loadDemoHistory(append = false): Promise<DemoBatch[]> {
    const requestSequence = ++historyRequestSequence
    const owner = getOwnerScope()
    historyLoading.value = true
    historyError.value = null
    try {
      const nextPage = demoHistoryPageSchema.parse(await getDemoBatchesPage({ page: append ? demoHistoryPage.value + 1 : 1, page_size: historyPageSize }))
      if (requestSequence === historyRequestSequence && owner === getOwnerScope()) {
        demoHistory.value = append ? [...new Map([...demoHistory.value, ...nextPage.data].map(batch => [String(batch.id), batch])).values()] : nextPage.data
        demoHistoryTotal.value = nextPage.total
        demoHistoryPage.value = nextPage.page
      }
    } catch (cause) {
      if (requestSequence === historyRequestSequence && owner === getOwnerScope()) historyError.value = errorMessage(cause, '演示记录暂时无法加载')
      throw cause
    } finally {
      if (requestSequence === historyRequestSequence) historyLoading.value = false
    }
    return demoHistory.value
  }

  function chooseTool(tool: BusinessTool): void {
    if (isActive.value || pendingStartMode) return
    imports.invalidate()
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
    const requestSequence = ++startRequestSequence
    pendingStartMode = tool.availability === 'demo_only' ? 'demo' : 'live'
    loading.value = true
    try {
      const nextSnapshot = tool.availability === 'demo_only'
        ? await demo.start(tool, preview, batchId)
        : await live.start(tool, preview, batchId, entitlements.value.max_open_sessions || 6)
      if (requestSequence === startRequestSequence) {
        try { saveSourceRows(getOwnerScope(), nextSnapshot) }
        catch { error.value = '原表行号暂时无法保存在本机，请在关闭本次结果前导出；执行不受影响。' }
      }
      if (requestSequence === startRequestSequence) importPreview.value = null
      return nextSnapshot
    } catch (cause) {
      if (requestSequence === startRequestSequence) error.value = errorMessage(cause, '无法开始批次')
      throw cause
    } finally {
      if (requestSequence === startRequestSequence) {
        pendingStartMode = null
        loading.value = false
      }
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
    const cancelDemo = pendingStartMode === 'demo' || isDemoBatch.value
    startRequestSequence += 1
    pendingStartMode = null
    loading.value = false
    if (cancelDemo) await demo.cancel(status)
    else await live.cancel(status)
  }

  async function resetWorkspace(): Promise<void> {
    if (isActive.value) throw new Error('当前批次仍在执行')
    startRequestSequence += 1
    pendingStartMode = null
    loading.value = false
    imports.invalidate()
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
    startRequestSequence += 1
    bootstrapRequestSequence += 1
    bootstrapInitialization = null
    pendingStartMode = null
    loading.value = false
    live.dispose()
    demo.dispose()
    recovery.dispose()
  }

  function retryRecovery(): void { recovery.retry() }
  function getSourceRows(kind: 'demo' | 'live', batchId: string | number): Record<string, number> {
    return readSourceRows(getOwnerScope(), kind, batchId)
  }

  return {
    bootstrap, history, demoHistory, demoHistoryTotal, liveHistoryHasMore, importPreview, selectedTool, snapshot, selectedItemId, selectedItem, loading, syncState, error, bootstrapStale, historyLoading, historyError,
    entitlements, tools, items, openItems, isActive, isDemoBatch, recoveryPending, recoveryStorageUnavailable, liveStorageUnavailable, retryRecovery,
    init, refreshBootstrap, loadHistory, loadDemoHistory, chooseTool, loadSampleImport, saveSampleTemplate, selectImportFile, exportImportErrors, startBatch, registerBrowser, selectItem,
    completeUserAction, restartItem, cancelBatch, resetWorkspace, statusText, flushOutboxWithin, dispose, getSourceRows,
  }
})
