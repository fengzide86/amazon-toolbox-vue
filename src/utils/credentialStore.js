const LEGACY_AUTH_KEY = 'toolbox_auth'

function legacyUserCode() {
  try {
    const raw = localStorage.getItem(LEGACY_AUTH_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      const code = parsed?.auth_code
      return code && code !== 'admin' ? code : null
    } catch {
      return raw !== 'admin' ? raw : null
    }
  } catch {
    return null
  }
}

export async function saveRememberedUserCode(code) {
  const store = window.electronAPI?.credentialStore
  if (!store?.saveUserCode) return false
  return Boolean(await store.saveUserCode(code))
}

export async function loadRememberedUserCode() {
  const store = window.electronAPI?.credentialStore
  let code = null
  if (store?.loadUserCode) {
    code = await store.loadUserCode()
  }

  if (!code) {
    const legacy = legacyUserCode()
    if (legacy && store?.saveUserCode && await store.saveUserCode(legacy)) {
      code = legacy
    }
  }

  // 认证秘密不再保留在 localStorage；管理员旧会话也不会跨重启恢复。
  localStorage.removeItem('toolbox_auth')
  localStorage.removeItem('toolbox_token')
  localStorage.removeItem('toolbox_role')
  return code
}

export async function clearRememberedUserCode() {
  const store = window.electronAPI?.credentialStore
  if (store?.clearUserCode) await store.clearUserCode()
}
