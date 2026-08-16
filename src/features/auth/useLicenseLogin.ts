import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Auth, getDeviceId, getDeviceName, showToast } from '@/utils'
import { api, verifyAuthCode } from '@/utils/api'
import { useUserStore } from '@/stores/user'
import { useConnectionStore } from '@/stores/connection'
import { saveRememberedUserCode } from '@/utils/credentialStore'
import { licenseLoginResponseSchema, publicSettingsSchema } from './model'

const stats = [
  { value: '90', unit: '%', desc: '操作提效 · 一键完成物料/发货' },
  { value: '10', unit: '×', desc: '上品速度 · 批量处理告别手动' },
  { value: '24', unit: 'h', desc: 'AI 客服 · 问题秒级响应' },
]

const featureTags = ['自动上品', '物流模板', '自动发货', 'FBA / AGL', '广告脚本', '批量操作']

const helpSteps = [
  '联系人工客服确认套餐后，您会收到一个授权码',
  '在此页面输入授权码进行激活',
  '系统会自动绑定您的 Windows 设备',
  '激活成功后即可体验当前套餐包含的演示工具',
]

function validateAuthCode(code: string): { valid: true } | { valid: false; message: string } {
  const trimmed = code.trim()
  if (!trimmed) return { valid: false, message: '请输入授权码' }
  if (trimmed.length < 4) return { valid: false, message: '授权码格式不正确，请检查后重试' }
  if (!/^[A-Za-z0-9-]+$/.test(trimmed)) return { valid: false, message: '授权码只能包含字母、数字和连字符' }
  return { valid: true }
}

export function useLicenseLogin() {
  const router = useRouter()
  const route = useRoute()
  const userStore = useUserStore()
  const connection = useConnectionStore()
  const authCode = ref('')
  const authCodeInput = ref<HTMLInputElement | null>(null)
  const isLoading = ref(false)
  const showError = ref(false)
  const showHelpModal = ref(false)
  const showContactModal = ref(false)
  const copySuccess = ref(false)
  const errorMessage = ref('')
  const inputFocused = ref(false)
  const loginSucceeded = ref(false)
  const deviceName = ref('')
  const deviceId = ref('')
  const wechatId = ref('AmazonToolbox_Support')

  const connectionStatusClass = computed(() => ({
    online: connection.status === 'online',
    offline: connection.status === 'offline',
    connecting: connection.status === 'unknown' || connection.status === 'degraded' || connection.status === 'recovering',
  }))
  const connectionStatusText = computed(() => {
    if (connection.status === 'online') return '服务可用'
    if (connection.status === 'offline') return '连接不稳定，正在恢复'
    return '正在连接服务'
  })

  async function loadWechatId() {
    try {
      const settings = publicSettingsSchema.parse(await api.get('/api/settings/public'))
      const setting = settings.find(item => item.key === 'wechat_id' || item.key === 'service_wechat')
      if (setting?.value) wechatId.value = setting.value
    } catch {
      // Contact information is optional and must not decide backend availability.
    }
  }

  function focusLoginInput() {
    nextTick(() => {
      const input = authCodeInput.value
      if (!input || isLoading.value) return
      input.focus({ preventScroll: true })
      const end = input.value.length
      input.setSelectionRange?.(end, end)
    })
  }

  async function handleLogin() {
    showError.value = false
    const validation = validateAuthCode(authCode.value)
    if (!validation.valid) {
      errorMessage.value = validation.message
      showError.value = true
      showToast(validation.message, 'error')
      focusLoginInput()
      return
    }

    isLoading.value = true
    try {
      const result = licenseLoginResponseSchema.parse(
        await verifyAuthCode(authCode.value.trim(), deviceId.value, deviceName.value),
      )
      if (!result.success) {
        errorMessage.value = result.message
        showError.value = true
        showToast(result.message, 'error')
        return
      }
      if (!result.data) throw new Error('授权登录响应缺少用户信息')

      userStore.setLogin({ token: result.data.token, role: 'user', auth_code: authCode.value.trim(), user: result.data })
      userStore.setDevice(deviceId.value, deviceName.value)
      Auth.set(authCode.value.trim())
      void saveRememberedUserCode(authCode.value.trim())
      if (result.data.platform_scope) {
        localStorage.setItem('toolbox_platform_scope', JSON.stringify(result.data.platform_scope))
      }
      loginSucceeded.value = true
      await new Promise(resolve => window.setTimeout(resolve, 160))
      window.dispatchEvent(new CustomEvent('toolbox:route-track', { detail: { duration: 780 } }))
      await new Promise(resolve => window.setTimeout(resolve, 270))
      const businessAccess = result.data.product_type === 'business'
        && result.data.business_workspace_enabled === true
        && result.data.entitlements?.batch_execution === true
        && result.data.entitlements?.multi_account_workspace === true
      await router.push(businessAccess ? '/business/overview' : '/user/tools')
    } catch (error) {
      const apiError = typeof error === 'object' && error !== null
        ? error as { kind?: string; message?: string; requestId?: string | null }
        : null
      const rawMessage = apiError?.message || (error instanceof Error ? error.message : '')
      const isNetworkFailure = apiError?.kind === 'timeout'
        || apiError?.kind === 'network'
        || /network|fetch|timeout/i.test(rawMessage)
      if (isNetworkFailure) {
        errorMessage.value = '网络暂时无法连接，请稍后重试'
      } else if (apiError?.kind === 'parse' || apiError?.kind === 'validation') {
        errorMessage.value = apiError.requestId
          ? `服务响应异常，问题编号：${apiError.requestId}`
          : '服务响应异常，请稍后重试'
      } else {
        errorMessage.value = rawMessage || '登录未完成，请稍后重试'
      }
      showError.value = true
      showToast(errorMessage.value, 'error')
    } finally {
      isLoading.value = false
      if (showError.value) focusLoginInput()
    }
  }

  function showHelp() {
    showHelpModal.value = true
  }

  function showContact() {
    showContactModal.value = true
    copySuccess.value = false
  }

  async function copyWechatId() {
    try {
      await navigator.clipboard.writeText(wechatId.value)
      copySuccess.value = true
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = wechatId.value
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      try {
        copySuccess.value = document.execCommand('copy')
      } catch {
        showToast('复制失败，请手动复制', 'error')
      } finally {
        document.body.removeChild(textArea)
      }
    }
    if (copySuccess.value) window.setTimeout(() => { copySuccess.value = false }, 2000)
  }

  function closeModals() {
    showHelpModal.value = false
    showContactModal.value = false
  }

  onMounted(() => {
    const handoffCode = sessionStorage.getItem('toolbox_login_handoff_code')
    if (handoffCode) {
      sessionStorage.removeItem('toolbox_login_handoff_code')
      authCode.value = handoffCode
    } else if (typeof route.query?.code === 'string') {
      // 兼容旧的内部测试链接；新管理端使用一次性 sessionStorage 交接，避免授权码留在地址栏。
      authCode.value = route.query.code
    }
    deviceId.value = getDeviceId()
    deviceName.value = getDeviceName()
    void loadWechatId()
    void connection.probe()
    const autoLoginError = localStorage.getItem('toolbox_auto_login_error')
    if (autoLoginError) {
      localStorage.removeItem('toolbox_auto_login_error')
      errorMessage.value = autoLoginError
      showError.value = true
    }
    focusLoginInput()
  })

  return {
    authCode, authCodeInput, isLoading, loginSucceeded, showError, showHelpModal, showContactModal, copySuccess,
    errorMessage, inputFocused, deviceName, wechatId, stats, featureTags, helpSteps,
    connectionStatusClass, connectionStatusText, handleLogin, showHelp, showContact, copyWechatId, closeModals,
  }
}
