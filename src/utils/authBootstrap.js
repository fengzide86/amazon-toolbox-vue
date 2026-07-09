import { verifyAuthCode } from './api/auth.js'
import { getDeviceId, getDeviceName } from './index.js'
import { loadRememberedUserCode, clearRememberedUserCode } from './credentialStore.js'
import { useUserStore } from '@/stores/user'

export async function initializeRememberedLogin() {
  if (sessionStorage.getItem('toolbox_token')) return true

  const code = await loadRememberedUserCode()
  if (!code) return false

  try {
    let res
    let lastError
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        res = await verifyAuthCode(code, getDeviceId(), getDeviceName())
        break
      } catch (err) {
        lastError = err
        if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    if (!res && lastError) throw lastError
    if (!res?.success || !res?.data?.token) {
      await clearRememberedUserCode()
      localStorage.setItem('toolbox_auto_login_error', res?.message || '自动登录已失效，请重新输入授权码')
      return false
    }

    const userStore = useUserStore()
    userStore.setLogin({
      token: res.data.token,
      role: 'user',
      auth_code: code,
      user: res.data,
    })
    userStore.setDevice(getDeviceId(), getDeviceName())
    if (res.data.platform_scope) {
      localStorage.setItem('toolbox_platform_scope', JSON.stringify(res.data.platform_scope))
    }
    return true
  } catch (err) {
    // 后端尚未启动或离线时保留加密凭据，允许下次启动重试。
    localStorage.setItem('toolbox_auto_login_error', '自动登录验证失败，请检查网络或后端服务')
    return false
  }
}
