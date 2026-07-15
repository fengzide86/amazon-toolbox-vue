import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  createBusinessBatch,
  createToolLaunchGrant,
  finishBusinessBatch,
  getBusinessBootstrap,
  getBusinessBatches,
  updateBusinessBatch,
  updateBusinessBatchItem,
} from '@/utils/api'

const STATUS_MESSAGE = {
  pending: '等待处理',
  running: '正在处理',
  waiting_user: '需要操作',
  completed: '已完成',
  failed: '未完成',
  cancelled: '已结束',
}

export const useBusinessWorkspaceStore = defineStore('businessWorkspace', () => {
  const bootstrap = ref(null)
  const history = ref([])
  const importPreview = ref(null)
  const selectedTool = ref(null)
  const snapshot = ref({ status: 'idle', items: [], counts: {} })
  const selectedItemId = ref(null)
  const loading = ref(false)
  const syncState = ref('synced')
  const error = ref(null)

  let removeEventListener = null
  let heartbeatTimer = null
  let syncTimer = null
  const provisioning = new Set()

  const entitlements = computed(() => bootstrap.value?.entitlements || {})
  const tools = computed(() => bootstrap.value?.tools || [])
  const items = computed(() => snapshot.value?.items || [])
  const selectedItem = computed(() => items.value.find(item => item.itemId === selectedItemId.value) || null)
  const isActive = computed(() => snapshot.value?.status === 'running')
  const openItems = computed(() => items.value.filter(item =>
    item.browserReady
    || item.itemId === snapshot.value?.provisioningItemId
    || ['running', 'waiting_user'].includes(item.status)
  ))

  async function init() {
    if (!bootstrap.value) bootstrap.value = await getBusinessBootstrap()
    if (!removeEventListener && window.electronAPI?.batch?.onEvent) {
      removeEventListener = window.electronAPI.batch.onEvent(handleBatchEvent)
    }
    const localSnapshot = await window.electronAPI?.batch?.getSnapshot?.()
    if (localSnapshot) applySnapshot(localSnapshot)
    startHeartbeat()
    return bootstrap.value
  }

  async function loadHistory() {
    history.value = await getBusinessBatches({ limit: 30 })
    return history.value
  }

  function chooseTool(tool) {
    if (isActive.value) return
    selectedTool.value = tool
    importPreview.value = null
    error.value = null
  }

  async function selectImportFile() {
    if (!selectedTool.value) throw new Error('请先选择批量工具')
    if (!window.electronAPI?.batch?.selectImportFile) throw new Error('批量导入仅支持桌面客户端')
    loading.value = true
    error.value = null
    try {
      importPreview.value = await window.electronAPI.batch.selectImportFile({
        schema: selectedTool.value.batch_input_schema || [],
        maxRows: entitlements.value.max_batch_rows || 50,
      })
      return importPreview.value
    } catch (importError) {
      error.value = importError.message || '文件导入失败'
      throw importError
    } finally {
      loading.value = false
    }
  }

  async function exportImportErrors() {
    if (!importPreview.value?.errors?.length) return null
    return window.electronAPI?.batch?.exportImportErrors?.(importPreview.value.errors)
  }

  async function startBatch() {
    if (!selectedTool.value || !importPreview.value?.validCount) throw new Error('请先导入有效数据')
    const batchId = `batch_${Date.now()}_${cryptoRandom()}`
    loading.value = true
    try {
      const response = await createBusinessBatch({
        client_batch_id: batchId,
        tool_id: selectedTool.value.id,
        tool_name: selectedTool.value.name,
        total_count: importPreview.value.validCount,
      })
      const serverBatch = response?.data ?? response
      const localSnapshot = await window.electronAPI.batch.create({
        importId: importPreview.value.importId,
        batchId,
        serverBatchId: serverBatch.id,
        tool: selectedTool.value,
        maxOpenSessions: entitlements.value.max_open_sessions || 6,
      })
      importPreview.value = null
      applySnapshot(localSnapshot)
      return localSnapshot
    } finally {
      loading.value = false
    }
  }

  async function registerBrowser(itemId, webContentsId) {
    await window.electronAPI.batch.registerBrowser(itemId, webContentsId)
    await startProvisionedItem(itemId)
  }

  async function startProvisionedItem(itemId) {
    if (provisioning.has(itemId)) return
    if (snapshot.value?.provisioningItemId !== itemId) return
    provisioning.add(itemId)
    try {
      const tool = snapshot.value.tool || selectedTool.value
      const platformKey = tool.platform_key || tool.platformKey || 'amazon'
      const grantResponse = await createToolLaunchGrant(tool.id, {
        platformKey,
        deviceId: localStorage.getItem('toolbox_device_id') || '',
        executionMode: 'batch',
        clientBatchId: snapshot.value.batchId,
        clientItemId: itemId,
        idempotencyKey: `${snapshot.value.batchId}:${itemId}`,
      })
      const grant = grantResponse?.launch_data || grantResponse?.grant
      if (!grant?.token) throw new Error('批量启动授权不完整')
      await window.electronAPI.batch.start({
        itemId,
        tool: {
          ...tool,
          platformKey: grant.platform_key || platformKey,
          targetUrl: grant.target_url || tool.target_url,
          launchGrant: {
            token: grant.token,
            expiresAt: grant.expires_at || grantResponse.expires_at,
            expiresIn: grantResponse.expires_in,
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
      error.value = startError.message || '无法启动该账号'
      const failedSnapshot = await window.electronAPI?.batch?.failItem?.({
        itemId,
        message: error.value,
      }).catch(() => null)
      if (failedSnapshot) applySnapshot(failedSnapshot)
      throw startError
    } finally {
      provisioning.delete(itemId)
    }
  }

  function selectItem(itemId) {
    selectedItemId.value = itemId
    window.electronAPI?.batch?.selectItem?.(itemId).catch(() => {})
  }

  async function completeUserAction(itemId) {
    applySnapshot(await window.electronAPI.batch.completeUserAction(itemId))
  }

  async function restartItem(itemId) {
    applySnapshot(await window.electronAPI.batch.restartItem(itemId))
  }

  async function cancelBatch(status = 'cancelled') {
    const serverBatchId = snapshot.value?.serverBatchId
    applySnapshot(await window.electronAPI?.batch?.cancel?.(status))
    if (serverBatchId) await finishBusinessBatch(serverBatchId, status).catch(() => {})
  }

  async function resetWorkspace() {
    if (isActive.value) throw new Error('当前批次仍在执行')
    await window.electronAPI?.batch?.cancel?.(snapshot.value?.status || 'completed')
    snapshot.value = { status: 'idle', items: [], counts: {} }
    selectedItemId.value = null
    selectedTool.value = null
    importPreview.value = null
    provisioning.clear()
  }

  function handleBatchEvent(event) {
    if (event?.snapshot) applySnapshot(event.snapshot)
    if (event?.type === 'batch.item_ready' && event.itemId) selectItem(event.itemId)
    if (event?.type === 'batch.item_updated' && event.itemId) syncItem(event.itemId)
    if (event?.type === 'batch.finished') {
      const status = event.snapshot?.status === 'completed' ? 'completed' : 'cancelled'
      if (event.snapshot?.serverBatchId) finishBusinessBatch(event.snapshot.serverBatchId, status).catch(() => {})
    }
    scheduleSummarySync()
  }

  function applySnapshot(next) {
    snapshot.value = next || { status: 'idle', items: [], counts: {} }
    if (!selectedItemId.value || !snapshot.value.items?.some(item => item.itemId === selectedItemId.value)) {
      selectedItemId.value = snapshot.value.activeItemId || snapshot.value.provisioningItemId || snapshot.value.items?.[0]?.itemId || null
    }
  }

  async function syncItem(itemId) {
    const batchId = snapshot.value?.serverBatchId
    const item = items.value.find(candidate => candidate.itemId === itemId)
    if (!batchId || !item) return
    syncState.value = 'syncing'
    try {
      await updateBusinessBatchItem(batchId, itemId, {
        account_label_masked: item.accountLabelMasked,
        status: item.status,
        intervention_type: item.interventionType || undefined,
        customer_message: item.message || undefined,
      })
      syncState.value = 'synced'
    } catch {
      syncState.value = 'offline'
    }
  }

  function scheduleSummarySync() {
    clearTimeout(syncTimer)
    syncTimer = setTimeout(syncSummary, 250)
  }

  async function syncSummary() {
    const batchId = snapshot.value?.serverBatchId
    if (!batchId || snapshot.value.status === 'idle') return
    const counts = snapshot.value.counts || {}
    try {
      await updateBusinessBatch(batchId, {
        status: snapshot.value.status === 'completed' ? 'completed' : 'running',
        pending_count: counts.pending || 0,
        running_count: counts.running || 0,
        waiting_count: counts.waiting || 0,
        completed_count: counts.completed || 0,
        failed_count: counts.failed || 0,
      })
      syncState.value = 'synced'
    } catch {
      syncState.value = 'offline'
    }
  }

  function startHeartbeat() {
    if (heartbeatTimer) return
    heartbeatTimer = setInterval(() => {
      if (isActive.value) syncSummary()
    }, 30000)
  }

  function dispose() {
    removeEventListener?.()
    removeEventListener = null
    clearInterval(heartbeatTimer)
    clearTimeout(syncTimer)
    heartbeatTimer = null
  }

  function statusText(status) {
    return STATUS_MESSAGE[status] || status
  }

  return {
    bootstrap,
    history,
    importPreview,
    selectedTool,
    snapshot,
    selectedItemId,
    selectedItem,
    loading,
    syncState,
    error,
    entitlements,
    tools,
    items,
    openItems,
    isActive,
    init,
    loadHistory,
    chooseTool,
    selectImportFile,
    exportImportErrors,
    startBatch,
    registerBrowser,
    selectItem,
    completeUserAction,
    restartItem,
    cancelBatch,
    resetWorkspace,
    statusText,
    dispose,
  }
})

function cryptoRandom() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint32Array(2)
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes, value => value.toString(16)).join('')
  }
  return Math.random().toString(16).slice(2)
}
