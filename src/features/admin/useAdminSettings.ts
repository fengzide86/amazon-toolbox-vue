import { computed, onMounted, ref } from 'vue'
import {
  archivePlan,
  createPlan,
  disablePlan,
  enablePlan,
  getPlansAdmin,
  getProfitPolicy,
  getSettings,
  updatePlan,
  updateProfitPolicy,
  updateSetting,
} from '@/utils/api'
import { showToast } from '@/utils'
import { confirmAction } from '@/shared/ui/confirm'
import { hasStaffPermission } from '@/features/auth/permissions'
import { authService } from '@/utils/auth'
import {
  adminPlanSchema,
  adminPlansSchema,
  adminSettingsSchema,
  profitPolicySchema,
  type AdminPlan,
} from '@/features/admin/model'
import {
  buildDisplayPlanPatch,
  buildPlanPermissionsPatch,
  type PlanPermissionDraft,
} from '@/features/admin/planLifecycle'

export function useAdminSettings() {
  const plans = ref<AdminPlan[]>([])
  const settings = ref<Array<{ key: string; value?: string | null }>>([])
  const editingPlan = ref<AdminPlan | null>(null)
  const showAddPlan = ref(false)
  const showPlanPermissions = ref(false)
  const planPermissionDraft = ref<PlanPermissionDraft | null>(null)
  const wechatId = ref('')

  const defaultEntitlements = () => ({
    batch_execution: true,
    multi_account_workspace: true,
    desktop_notification: true,
    usage_metering: false,
    max_batch_rows: 50,
    max_open_sessions: 6,
  })
  const newPlan = ref({
    name: '',
    price: 1,
    duration_days: 7,
    features: '',
    product_type: 'consumer' as 'consumer' | 'business',
    entitlements: defaultEntitlements(),
  })

  const showProfitModal = ref(false)
  const canEditProfitPolicy = computed(() => hasStaffPermission(authService.getRole(), 'profit.policy.write'))
  const profitRatios = ref({
    tech: 30,
    market: 25,
    product: 15,
    service: 15,
    coordination: 10,
    record: 5,
  })

  const profitTotal = computed(() => (
    profitRatios.value.tech + profitRatios.value.market + profitRatios.value.product
    + profitRatios.value.service + profitRatios.value.coordination + profitRatios.value.record
  ))

  const profitRatiosText = computed(() => {
    const ratios = profitRatios.value
    return `技术${ratios.tech}% / 市场${ratios.market}% / 产品${ratios.product}% / 客服${ratios.service}% / 统筹${ratios.coordination}% / 记录${ratios.record}%`
  })

  async function loadData() {
    const results = await Promise.allSettled([
      getPlansAdmin(),
      getSettings(),
      getProfitPolicy(),
    ])
    const [plansResult, settingsResult, profitPolicyResult] = results

    if (plansResult.status === 'fulfilled') {
      plans.value = adminPlansSchema.parse(plansResult.value)
    }
    if (settingsResult.status === 'fulfilled') {
      const parsedSettings = adminSettingsSchema.parse(settingsResult.value)
      settings.value = parsedSettings
      const wxSetting = parsedSettings.find((setting) => setting.key === 'wechat_id')
      if (wxSetting) wechatId.value = wxSetting.value || ''
    }
    if (profitPolicyResult.status === 'fulfilled') {
      const policy = profitPolicySchema.parse(profitPolicyResult.value)
      profitRatios.value = {
        tech: Number((policy.ratios.tech * 100).toFixed(2)),
        market: Number((policy.ratios.market * 100).toFixed(2)),
        product: Number((policy.ratios.product * 100).toFixed(2)),
        service: Number((policy.ratios.service * 100).toFixed(2)),
        coordination: Number((policy.ratios.coordination * 100).toFixed(2)),
        record: Number((policy.ratios.record * 100).toFixed(2)),
      }
    }
    if (results.every((result) => result.status === 'rejected')) {
      showToast('数据加载失败', 'error')
    }
  }

  async function saveWechat() {
    try {
      await updateSetting({
        key: 'wechat_id',
        value: wechatId.value,
        description: '客服微信号',
      })
      showToast('已保存', 'success')
    } catch {
      showToast('保存失败', 'error')
    }
  }

  function startEdit(rawPlan: unknown) {
    const plan = adminPlanSchema.parse(rawPlan)
    if (plan.status === 'archived') return
    editingPlan.value = { ...plan }
  }

  async function savePlan() {
    const plan = editingPlan.value
    if (!plan) return
    try {
      await updatePlan(plan.id, buildDisplayPlanPatch(plan))
      showToast(plan.status === 'active' ? '展示信息已更新' : '套餐已更新', 'success')
      editingPlan.value = null
      await loadData()
    } catch {
      showToast('更新失败，请检查套餐状态和输入内容', 'error')
    }
  }

  function openPlanPermissions(rawPlan: unknown) {
    const plan = adminPlanSchema.parse(rawPlan)
    if (plan.status !== 'disabled') {
      showToast('请先禁用套餐，再修改产品类型和专业权限', 'warning')
      return
    }
    const entitlements = { ...defaultEntitlements(), ...(plan.entitlements || {}) }
    planPermissionDraft.value = {
      id: plan.id,
      status: 'disabled',
      product_type: plan.product_type || 'consumer',
      batchEnabled: Boolean(entitlements.batch_execution && entitlements.multi_account_workspace),
      maxBatchRows: Number(entitlements.max_batch_rows || 50),
      maxOpenSessions: Number(entitlements.max_open_sessions || 6),
      desktopNotification: entitlements.desktop_notification !== false,
    }
    showPlanPermissions.value = true
  }

  async function savePlanPermissions() {
    const draft = planPermissionDraft.value
    if (!draft) return
    try {
      await updatePlan(draft.id, buildPlanPermissionsPatch(draft))
      showPlanPermissions.value = false
      showToast('产品权限已更新', 'success')
      await loadData()
    } catch {
      showToast('请先禁用套餐，再保存产品权限', 'error')
    }
  }

  async function togglePlanStatus(rawPlan: unknown) {
    const plan = adminPlanSchema.parse(rawPlan)
    if (plan.status !== 'active' && plan.status !== 'disabled') return
    const enabling = plan.status === 'disabled'
    try {
      if (enabling) await enablePlan(plan.id)
      else await disablePlan(plan.id)
      showToast(enabling ? '已启用' : '已禁用', 'success')
      editingPlan.value = null
      await loadData()
    } catch {
      showToast('状态切换失败', 'error')
    }
  }

  async function archivePlanStatus(rawPlan: unknown) {
    const plan = adminPlanSchema.parse(rawPlan)
    if (plan.status === 'archived') return
    if (!await confirmAction({
      title: '归档套餐？',
      message: `归档“${plan.name}”后不能恢复或修改；存在可用授权码时后端会拒绝归档。`,
      confirmText: '确认归档',
      danger: true,
    })) return
    try {
      await archivePlan(plan.id)
      showToast('套餐已归档', 'success')
      editingPlan.value = null
      await loadData()
    } catch {
      showToast('归档失败，请先处理该套餐的可用授权码', 'error')
    }
  }

  async function addPlan() {
    if (!newPlan.value.name.trim()) {
      showToast('请输入套餐名称', 'error')
      return
    }
    if (!Number.isFinite(newPlan.value.price) || newPlan.value.price <= 0) {
      showToast('套餐价格必须大于 0', 'error')
      return
    }
    if (!Number.isInteger(newPlan.value.duration_days) || newPlan.value.duration_days <= 0) {
      showToast('有效期必须是大于 0 的整数天数', 'error')
      return
    }
    try {
      const isBusiness = newPlan.value.product_type === 'business'
      await createPlan({
        ...newPlan.value,
        name: newPlan.value.name.trim(),
        entitlements: {
          ...newPlan.value.entitlements,
          batch_execution: isBusiness,
          multi_account_workspace: isBusiness,
        },
      })
      showToast('套餐已添加；默认处于禁用状态', 'success')
      showAddPlan.value = false
      newPlan.value = {
        name: '',
        price: 1,
        duration_days: 7,
        features: '',
        product_type: 'consumer',
        entitlements: defaultEntitlements(),
      }
      await loadData()
    } catch {
      showToast('添加失败', 'error')
    }
  }

  function planStatusText(status?: string) {
    return status === 'active' ? '启用' : status === 'disabled' ? '禁用' : status === 'archived' ? '已归档' : '未知'
  }

  function planStatusType(status?: string): 'success' | 'danger' | 'info' {
    return status === 'active' ? 'success' : status === 'disabled' ? 'danger' : 'info'
  }

  function openProfitEdit() {
    if (!canEditProfitPolicy.value) return
    showProfitModal.value = true
  }

  async function saveProfitRatios() {
    if (!canEditProfitPolicy.value) return
    if (Math.abs(profitTotal.value - 100) > 0.001) {
      showToast('分润比例总和必须为100%', 'error')
      return
    }
    try {
      await updateProfitPolicy(Object.fromEntries(
        Object.entries(profitRatios.value).map(([key, value]) => [key, Number((value / 100).toFixed(6))]),
      ))
      showToast('分润比例已更新', 'success')
      showProfitModal.value = false
    } catch {
      showToast('保存失败', 'error')
    }
  }

  onMounted(loadData)

  return {
    plans,
    settings,
    editingPlan,
    showAddPlan,
    showPlanPermissions,
    planPermissionDraft,
    wechatId,
    newPlan,
    showProfitModal,
    canEditProfitPolicy,
    profitRatios,
    profitTotal,
    profitRatiosText,
    loadData,
    saveWechat,
    startEdit,
    savePlan,
    openPlanPermissions,
    savePlanPermissions,
    togglePlanStatus,
    archivePlanStatus,
    addPlan,
    planStatusText,
    planStatusType,
    openProfitEdit,
    saveProfitRatios,
  }
}
