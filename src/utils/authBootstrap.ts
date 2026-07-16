import { z } from 'zod'
import { verifyAuthCode } from './api/auth'
import { getDeviceId, getDeviceName } from './index'
import { loadRememberedUserCode, clearRememberedUserCode } from './credentialStore'
import { useUserStore } from '@/stores/user'
import { authenticatedUserSchema } from '@/features/auth/model'

const verifyResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: authenticatedUserSchema.extend({ token: z.string() }).optional(),
}).passthrough()

const wait = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds))

export async function initializeRememberedLogin(): Promise<boolean> {
  if (sessionStorage.getItem('toolbox_token')) return true

  const code = await loadRememberedUserCode()
  if (!code) return false

  try {
    let response: unknown
    let lastError: unknown
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        response = await verifyAuthCode(code, getDeviceId(), getDeviceName())
        break
      } catch (error) {
        lastError = error
        if (attempt < 4) await wait(1000)
      }
    }
    if (response === undefined && lastError) throw lastError

    const result = verifyResponseSchema.safeParse(response)
    if (!result.success || !result.data.success || !result.data.data?.token) {
      await clearRememberedUserCode()
      const message = result.success ? result.data.message : undefined
      localStorage.setItem('toolbox_auto_login_error', message || '自动登录已失效，请重新输入授权码')
      return false
    }

    const data = result.data.data
    const userStore = useUserStore()
    userStore.setLogin({ token: data.token, role: 'user', auth_code: code, user: data })
    userStore.setDevice(getDeviceId(), getDeviceName())
    if (data.platform_scope) {
      localStorage.setItem('toolbox_platform_scope', JSON.stringify(data.platform_scope))
    }
    return true
  } catch {
    // 后端尚未启动或离线时保留加密凭据，允许下次启动重试。
    localStorage.setItem('toolbox_auto_login_error', '自动登录验证失败，请检查网络或后端服务')
    return false
  }
}
