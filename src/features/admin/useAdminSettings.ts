import { ref, computed, onMounted } from 'vue'
import { getPlansAdmin, getSettings, updateSetting, getTools, updateTools, getToolReleases, createToolRelease, publishToolRelease, rollbackToolRelease } from '@/utils/api'
import { showToast } from '@/utils'
import { confirmAction } from '@/shared/ui/confirm'
import { ElMessageBox } from 'element-plus'
import {
  adminPlanSchema,
  adminPlansSchema,
  adminSettingsSchema,
  toolReleaseSchema,
  toolReleasesSchema,
  type AdminPlan,
  type ToolRelease,
} from '@/features/admin/model'
import {
  errorMessage,
  toolCatalogItemSchema,
  toolCatalogSchema,
  toolUpdateResponseSchema,
  type ToolCatalogItem,
} from '@/features/tools/model'


export function useAdminSettings() {
interface PlanPermissionDraft {
  id: string | number
  product_type: 'consumer' | 'business'
  batchEnabled: boolean
  maxBatchRows: number
  maxOpenSessions: number
  desktopNotification: boolean
}

interface BatchInputField {
  key: string
  label: string
  type: 'text'
  required: boolean
  sensitive: boolean
}

const plans = ref<AdminPlan[]>([])
const settings = ref<Array<{ key: string; value?: string | null }>>([])
const tools = ref<ToolCatalogItem[]>([])
const toolReleases = ref<ToolRelease[]>([])
const editingPlan = ref<AdminPlan | null>(null)
const editingToolIndex = ref(-1)
const editingToolSnapshot = ref<ToolCatalogItem | null>(null)
const showAddPlan = ref(false)
const showPlanPermissions = ref(false)
const planPermissionDraft = ref<PlanPermissionDraft | null>(null)
const showReleaseModal = ref(false)
const releaseSaving = ref(false)
const newRelease = ref({ tool_id: '', version: '1.0.0', script_key: '', artifact_sha256: 'embedded' })

const adminPassword = ref('')
const wechatId = ref('')
const businessWorkspaceEnabled = ref(false)

const defaultEntitlements = () => ({ batch_execution: true, multi_account_workspace: true, desktop_notification: true, usage_metering: false, max_batch_rows: 50, max_open_sessions: 6 })
const newPlan = ref({ name: '', price: 0, duration_days: 7, features: '', product_type: 'consumer', entitlements: defaultEntitlements() })

const categoryOptions = [
  { label: '数据分析', value: 'data' },
  { label: '运营工具', value: 'operation' },
  { label: '自动化工具', value: 'automation' },
  { label: '其他工具', value: 'other' }
]

// 分润比例
const showProfitModal = ref(false)
const profitRatios = ref({
  tech: 30,
  market: 25,
  product: 15,
  service: 15,
  coordination: 10,
  record: 5
})

const profitTotal = computed(() => {
  return profitRatios.value.tech + profitRatios.value.market + profitRatios.value.product +
    profitRatios.value.service + profitRatios.value.coordination + profitRatios.value.record
})

const profitRatiosText = computed(() => {
  const r = profitRatios.value
  return `技术${r.tech}% / 市场${r.market}% / 产品${r.product}% / 客服${r.service}% / 统筹${r.coordination}% / 记录${r.record}%`
})

async function loadData() {
  try {
    const [plansRes, settingsRes, toolsRes, releasesRes] = await Promise.all([
      getPlansAdmin(), getSettings(), getTools(), getToolReleases()
    ])
    plans.value = adminPlansSchema.parse(plansRes)
    const parsedSettings = adminSettingsSchema.parse(settingsRes)
    settings.value = parsedSettings
    tools.value = toolCatalogSchema.parse(toolsRes)
    toolReleases.value = toolReleasesSchema.parse(releasesRes)

    const wxSetting = parsedSettings.find((setting) => setting.key === 'wechat_id')
    const profitSetting = parsedSettings.find((setting) => setting.key === 'profit_ratios')
    const businessSetting = parsedSettings.find((setting) => setting.key === 'business_workspace_enabled')
    if (wxSetting) wechatId.value = wxSetting.value || ''
    businessWorkspaceEnabled.value = String(businessSetting?.value || '').toLowerCase() === 'true'
    if (profitSetting && profitSetting.value) {
      try {
        const ratios: unknown = JSON.parse(profitSetting.value)
        if (typeof ratios === 'object' && ratios !== null) {
          const updates = Object.fromEntries(Object.entries(ratios).filter(([, value]) => typeof value === 'number'))
          profitRatios.value = { ...profitRatios.value, ...updates }
        }
      } catch (e) {
        // 使用默认值
      }
    }
  } catch (err) {
    showToast('数据加载失败', 'error')
  }
}

async function savePassword() {
  if (!adminPassword.value.trim()) {
    showToast('请输入密码', 'error')
    return
  }
  try {
    await updateSetting({ 
      key: 'admin_password', 
      value: adminPassword.value.trim(), 
      description: '管理员密码' 
    })
    showToast('密码已更新', 'success')
    adminPassword.value = ''
  } catch (err) {
    showToast('更新失败', 'error')
  }
}

async function saveWechat() {
  try {
    await updateSetting({ 
      key: 'wechat_id', 
      value: wechatId.value, 
      description: '客服微信号' 
    })
    showToast('已保存', 'success')
  } catch (err) {
    showToast('保存失败', 'error')
  }
}

async function saveBusinessWorkspaceSetting(rawValue: string | number | boolean) {
  const value = rawValue === true
  try {
    await updateSetting({ key: 'business_workspace_enabled', value: value ? 'true' : 'false', description: '专业批量工作台全局发布开关' })
    showToast(value ? '专业批量工作台已开启' : '专业批量工作台已关闭', 'success')
  } catch {
    businessWorkspaceEnabled.value = !value
    showToast('发布开关保存失败', 'error')
  }
}

function startEdit(rawPlan: unknown) {
  editingPlan.value = { ...adminPlanSchema.parse(rawPlan) }
}

async function savePlan(_plan: unknown) {
  if (!editingPlan.value) return
  try {
    const { id, name, price, duration_days, features, status } = editingPlan.value
    const { api } = await import('@/utils/api')
    await api.put(`/api/plans/${id}`, { name, price, duration_days, features, status })
    showToast('套餐已更新', 'success')
    editingPlan.value = null
    await loadData()
  } catch (err) {
    showToast('更新失败', 'error')
  }
}

function openPlanPermissions(rawPlan: unknown) {
  const plan = adminPlanSchema.parse(rawPlan)
  const entitlements = { ...defaultEntitlements(), ...(plan.entitlements || {}) }
  planPermissionDraft.value = {
    id: plan.id,
    product_type: plan.product_type || 'consumer',
    batchEnabled: Boolean(entitlements.batch_execution && entitlements.multi_account_workspace),
    maxBatchRows: Number(entitlements.max_batch_rows || 50),
    maxOpenSessions: Number(entitlements.max_open_sessions || 6),
    desktopNotification: entitlements.desktop_notification !== false,
  }
  showPlanPermissions.value = true
}

async function savePlanPermissions() {
  if (!planPermissionDraft.value) return
  const draft = planPermissionDraft.value
  const isBusiness = draft.product_type === 'business'
  try {
    const { api } = await import('@/utils/api')
    await api.put(`/api/plans/${draft.id}`, {
      product_type: draft.product_type,
      entitlements: {
        batch_execution: isBusiness && draft.batchEnabled,
        multi_account_workspace: isBusiness && draft.batchEnabled,
        desktop_notification: draft.desktopNotification,
        usage_metering: false,
        max_batch_rows: draft.maxBatchRows,
        max_open_sessions: draft.maxOpenSessions,
      },
    })
    showPlanPermissions.value = false
    showToast('产品权限已更新', 'success')
    await loadData()
  } catch (error) {
    showToast(errorMessage(error, '权限保存失败'), 'error')
  }
}

async function togglePlanStatus(rawPlan: unknown) {
  const plan = adminPlanSchema.parse(rawPlan)
  const newStatus = plan.status === 'active' ? 'disabled' : 'active'
  try {
    const { api } = await import('@/utils/api')
    await api.put(`/api/plans/${plan.id}`, { status: newStatus })
    showToast(newStatus === 'active' ? '已启用' : '已禁用', 'success')
    await loadData()
  } catch (err) {
    showToast('操作失败', 'error')
  }
}

async function addPlan() {
  if (!newPlan.value.name) {
    showToast('请输入套餐名称', 'error')
    return
  }
  try {
    const { api } = await import('@/utils/api')
    const payload = {
      ...newPlan.value,
      entitlements: {
        ...newPlan.value.entitlements,
        batch_execution: newPlan.value.product_type === 'business',
        multi_account_workspace: newPlan.value.product_type === 'business',
      },
    }
    await api.post('/api/plans', payload)
    showToast('套餐已添加', 'success')
    showAddPlan.value = false
    newPlan.value = { name: '', price: 0, duration_days: 7, features: '', product_type: 'consumer', entitlements: defaultEntitlements() }
    await loadData()
  } catch (err) {
    showToast('添加失败', 'error')
  }
}

function addTool() {
  const nextOrder = tools.value.length + 1
  tools.value.push(toolCatalogItemSchema.parse({
    id: `tool_custom_${Date.now()}`,
    name: '新工具', 
    module: '未分类', 
    category: 'automation',
    platform_key: 'amazon',
    capability_key: 'custom',
    script_key: 'amazon.custom.v1',
    target_url: '',
    tool_version: '1.0.0',
    runner_api_version: 1,
    release_status: 'available',
    available_plans: [], 
    available_plans_text: '',
    status: 'online',
    sort_order: nextOrder,
    description: '',
    capability_tags: [],
    capability_tags_text: '',
    preparation_notes: [],
    preparation_notes_text: '',
    intervention_scenarios: [],
    intervention_scenarios_text: '',
    supports_batch: false,
    business_description: '',
    batch_input_schema: [],
    batch_schema_text: 'account_label|客户简称|text|required'
  }))
  editingToolIndex.value = tools.value.length - 1
  editingToolSnapshot.value = null
}

function startToolEdit(rawRow: unknown, index: number) {
  const row = toolCatalogItemSchema.parse(rawRow)
  row.available_plans_text = splitList(row.available_plans).join(',')
  row.capability_tags_text = splitList(row.capability_tags).join(',')
  row.preparation_notes_text = splitList(row.preparation_notes).join(',')
  row.intervention_scenarios_text = splitList(row.intervention_scenarios).join(',')
  row.batch_schema_text = formatBatchSchema(row.batch_input_schema)
  editingToolSnapshot.value = toolCatalogItemSchema.parse(JSON.parse(JSON.stringify(row)) as unknown)
  editingToolIndex.value = index
}

function cancelToolEdit() {
  const index = editingToolIndex.value
  if (index >= 0 && editingToolSnapshot.value) {
    tools.value.splice(index, 1, editingToolSnapshot.value)
  } else if (index >= 0 && tools.value[index]?.name === '新工具') {
    tools.value.splice(index, 1)
  }
  editingToolIndex.value = -1
  editingToolSnapshot.value = null
}

function normalizeToolForSave(tool: ToolCatalogItem, index: number): ToolCatalogItem {
  const {
    available_plans_text: _availablePlansText,
    capability_tags_text: capabilityTagsText,
    preparation_notes_text: preparationNotesText,
    intervention_scenarios_text: interventionScenariosText,
    batch_schema_text: batchSchemaText,
    ...toolData
  } = tool
  const platformKey = tool.platform_key || 'amazon'
  const capabilityKey = slugify(tool.capability_key || tool.id || tool.name || `tool_${index + 1}`)
  const id = slugify(tool.id || `tool_${capabilityKey}`)
  const plansText = tool.available_plans_text ?? splitList(tool.available_plans).join(',')
  return toolCatalogItemSchema.parse({
    ...toolData,
    id,
    name: (tool.name || '未命名工具').trim(),
    module: (tool.module || '未分类').trim(),
    category: tool.category || 'automation',
    platform_key: platformKey,
    capability_key: capabilityKey,
    script_key: tool.script_key || `${platformKey}.${capabilityKey}.v1`,
    target_url: tool.target_url || '',
    tool_version: String(tool.tool_version || '1.0.0'),
    runner_api_version: Number(tool.runner_api_version || 1),
    release_status: tool.release_status || 'available',
    status: tool.status || 'online',
    sort_order: Number(tool.sort_order || index + 1),
    available_plans: plansText.split(',').map(item => item.trim()).filter(Boolean),
    description: tool.description || '',
    capability_tags: splitList(capabilityTagsText ?? tool.capability_tags, 3),
    preparation_notes: splitList(preparationNotesText ?? tool.preparation_notes),
    intervention_scenarios: splitList(interventionScenariosText ?? tool.intervention_scenarios),
    supports_batch: Boolean(tool.supports_batch),
    business_description: tool.business_description || '',
    batch_input_schema: tool.supports_batch ? parseBatchSchema(batchSchemaText, tool.batch_input_schema) : [],
    requires_signature: tool.requires_signature !== false
  })
}

function splitList(value: unknown, limit = 20): string[] {
  const source = Array.isArray(value) ? value : String(value || '').split(/[,，\n]/)
  return source.map(item => String(item).trim()).filter(Boolean).slice(0, limit)
}

function formatBatchSchema(schema: BatchInputField[] = []): string {
  const rows: BatchInputField[] = schema.length ? schema : [{ key: 'account_label', label: '客户简称', type: 'text', required: true, sensitive: false }]
  return rows.map(field => `${field.key}|${field.label || field.key}|text|${field.required ? 'required' : 'optional'}`).join('\n')
}

function parseBatchSchema(text: unknown, fallback: BatchInputField[] = []): BatchInputField[] {
  const forbidden = /password|passwd|pwd|secret|token|cookie/i
  const rows = String(text || formatBatchSchema(fallback)).split('\n').map(line => {
    const [rawKey, rawLabel, , required] = line.split('|').map(item => item?.trim())
    const key = slugify(rawKey || '')
    if (!key || forbidden.test(key)) return null
    return { key, label: rawLabel || key, type: 'text', required: required !== 'optional', sensitive: false }
  }).filter((field): field is BatchInputField => field !== null)
  if (!rows.some(field => field.key === 'account_label')) rows.unshift({ key: 'account_label', label: '客户简称', type: 'text', required: true, sensitive: false })
  return rows
}

async function saveTool(index: number) {
  const selectedTool = tools.value[index]
  if (!selectedTool) return
  const tool = normalizeToolForSave(selectedTool, index)
  if (!tool.name || !tool.id) {
    showToast('请填写工具名称和 ID', 'error')
    return
  }
  if (tool.target_url && !/^https?:\/\//i.test(tool.target_url)) {
    showToast('目标网址必须以 http:// 或 https:// 开头', 'error')
    return
  }
  tools.value.splice(index, 1, tool)
  try {
    const saved = toolUpdateResponseSchema.parse(await updateTools(tools.value.map((item, itemIndex) => normalizeToolForSave(item, itemIndex))))
    if (saved.data) {
      tools.value = saved.data
    } else {
      await loadData()
    }
    showToast('工具配置已保存', 'success')
    editingToolIndex.value = -1
    editingToolSnapshot.value = null
  } catch (error) {
    showToast(errorMessage(error, '保存失败'), 'error')
  }
}

async function removeTool(index: number) {
  if (!await confirmAction({
    title: '删除工具配置？',
    message: '删除后用户端将不再展示此工具，此操作不能撤销。',
    confirmText: '确认删除',
    danger: true,
  })) return
  tools.value.splice(index, 1)
  updateTools(tools.value)
    .then(() => showToast('已删除', 'success'))
    .catch(() => showToast('删除失败', 'error'))
}

function slugify(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'tool'
}

function platformLabel(platformKey?: string) {
  return platformKey === 'aliexpress' ? '速卖通' : '亚马逊'
}

function categoryLabel(category?: string) {
  return categoryOptions.find(item => item.value === category)?.label || '其他工具'
}

function toolStatusLabel(status?: string) {
  return status === 'online' ? '用户端在线' : status === 'offline' ? '用户端下线' : '用户端维护'
}

function releaseStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    available: '可启动',
    beta: 'Beta 可启动',
    maintenance: '维护中',
    disabled: '已禁用'
  }
  return status ? labels[status] || '维护中' : '维护中'
}

function syncReleaseScriptKey(toolId: string | number) {
  const tool = tools.value.find(item => item.id === toolId)
  if (tool) newRelease.value.script_key = tool.script_key || `${tool.platform_key}.${tool.capability_key}.v1`
}

async function saveRelease() {
  if (!newRelease.value.tool_id || !newRelease.value.version || !newRelease.value.script_key) {
    showToast('请完整填写工具、版本和脚本 Key', 'error')
    return
  }
  releaseSaving.value = true
  try {
    await createToolRelease(newRelease.value)
    showToast('签名版本已创建', 'success')
    showReleaseModal.value = false
    newRelease.value = { tool_id: '', version: '1.0.0', script_key: '', artifact_sha256: 'embedded' }
    await loadData()
  } catch (error) {
    showToast(errorMessage(error, '创建版本失败'), 'error')
  } finally {
    releaseSaving.value = false
  }
}

async function publishRelease(rawRelease: unknown, channel: 'stable' | 'canary') {
  const release = toolReleaseSchema.parse(rawRelease)
  let rollout = 100
  if (channel === 'canary') {
    try {
      const result = await ElMessageBox.prompt('请输入 1–99 的灰度比例', '灰度发布', {
        inputValue: String(release.rollout_percentage || 10),
        inputPattern: /^(?:[1-9]|[1-9]\d)$/,
        inputErrorMessage: '请输入 1–99 的整数',
        confirmButtonText: '确认发布',
        cancelButtonText: '取消',
      })
      rollout = Number(result.value)
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      throw error
    }
    if (!Number.isInteger(rollout) || rollout < 1 || rollout > 99) {
      showToast('灰度比例必须是 1-99 的整数', 'error')
      return
    }
  }
  try {
    await publishToolRelease(release.tool_id, release.version, { channel, rollout_percentage: rollout })
    showToast(channel === 'stable' ? '已全量发布' : `已灰度发布 ${rollout}%`, 'success')
    await loadData()
  } catch (error) {
    showToast(errorMessage(error, '发布失败'), 'error')
  }
}

async function rollbackRelease(rawRelease: unknown) {
  const release = toolReleaseSchema.parse(rawRelease)
  if (!await confirmAction({
    title: '回滚工具版本？',
    message: `将 ${release.tool_id} 回滚到 ${release.version}，后续启动会使用该版本。`,
    confirmText: '确认回滚',
    danger: true,
  })) return
  try {
    await rollbackToolRelease(release.tool_id, release.version)
    showToast(`已回滚到 ${release.version}`, 'success')
    await loadData()
  } catch (error) {
    showToast(errorMessage(error, '回滚失败'), 'error')
  }
}

function openProfitEdit() {
  showProfitModal.value = true
}

async function saveProfitRatios() {
  if (profitTotal.value !== 100) {
    showToast('分润比例总和必须为100%', 'error')
    return
  }
  try {
    await updateSetting({
      key: 'profit_ratios',
      value: JSON.stringify(profitRatios.value),
      description: '分润比例配置'
    })
    showToast('分润比例已更新', 'success')
    showProfitModal.value = false
  } catch (err) {
    showToast('保存失败', 'error')
  }
}

onMounted(loadData)
  return {
    plans, settings, tools, toolReleases, editingPlan, editingToolIndex, showAddPlan,
    showPlanPermissions, planPermissionDraft, showReleaseModal, releaseSaving, newRelease,
    adminPassword, wechatId, businessWorkspaceEnabled, newPlan, categoryOptions,
    showProfitModal, profitRatios, profitTotal, profitRatiosText,
    loadData, savePassword, saveWechat, saveBusinessWorkspaceSetting, startEdit, savePlan,
    openPlanPermissions, savePlanPermissions, togglePlanStatus, addPlan, addTool,
    startToolEdit, cancelToolEdit, saveTool, removeTool, platformLabel, categoryLabel,
    toolStatusLabel, releaseStatusLabel, syncReleaseScriptKey, saveRelease,
    publishRelease, rollbackRelease, openProfitEdit, saveProfitRatios,
  }
}