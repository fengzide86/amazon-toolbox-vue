import { parseAuthSession } from '@/features/auth/model'
import { getRuntimeCapabilities } from '@/runtime/capabilities'

const LEGACY_AUTH_KEY = 'toolbox_auth'

function legacyUserCode(): string | null {
  try {
    const auth = parseAuthSession(localStorage.getItem(LEGACY_AUTH_KEY))
    const code = auth?.auth_code
    return code && code !== 'admin' ? code : null
  } catch {
    return null
  }
}

export async function saveRememberedUserCode(code: string): Promise<boolean> {
  if (!getRuntimeCapabilities().credentialStore) return false
  const store = window.electronAPI?.credentialStore
  if (!store) return false
  return Boolean(await store.saveUserCode(code))
}

export async function loadRememberedUserCode(): Promise<string | null> {
  const store = getRuntimeCapabilities().credentialStore
    ? window.electronAPI?.credentialStore
    : undefined
  let code = store ? await store.loadUserCode() : null

  if (!code) {
    const legacy = legacyUserCode()
    if (legacy && store && await store.saveUserCode(legacy)) code = legacy
  }

  localStorage.removeItem('toolbox_auth')
  localStorage.removeItem('toolbox_token')
  localStorage.removeItem('toolbox_role')
  return code
}

export async function clearRememberedUserCode(): Promise<void> {
  if (!getRuntimeCapabilities().credentialStore) return
  const store = window.electronAPI?.credentialStore
  if (store) await store.clearUserCode()
}
