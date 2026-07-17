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

export async function initializeRememberedLogin(): Promise<boolean> {
  if (sessionStorage.getItem('toolbox_token')) return true

  const code = await loadRememberedUserCode()
  if (!code) return false

  try {
    const response = await verifyAuthCode(code, getDeviceId(), getDeviceName())

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
  } catch (error) {
    // Keep the encrypted credential on transient failures so the user can retry.
    const apiError = typeof error === 'object' && error !== null
      ? error as { kind?: string; message?: string }
      : null
    const message = apiError?.kind === 'network' || apiError?.kind === 'timeout'
      ? '暂时无法自动验证，请手动重试'
      : apiError?.message || '自动登录未完成，请重新输入授权码'
    localStorage.setItem('toolbox_auto_login_error', message)
    return false
  }
}
