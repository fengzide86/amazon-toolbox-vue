import { authService } from './auth'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

const TOAST_ICONS: Record<ToastType, string> = {
  success: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
  error: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
  warning: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  info: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
}

export function showToast(message: string, type: ToastType = 'info'): void {
  let container = document.querySelector<HTMLElement>('.toast-container')
  if (!container) {
    container = document.createElement('div')
    container.className = 'toast-container'
    document.body.appendChild(container)
  }

  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  const iconWrapper = document.createElement('span')
  iconWrapper.innerHTML = TOAST_ICONS[type]
  toast.appendChild(iconWrapper)
  const messageSpan = document.createElement('span')
  messageSpan.textContent = message
  toast.appendChild(messageSpan)
  container.appendChild(toast)
  setTimeout(() => {
    toast.classList.add('removing')
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

export const Auth = {
  set(code: string): void {
    const current = authService.getAuth() || {}
    authService.setAuth({ ...current, auth_code: code })
    localStorage.setItem('toolbox_login_time', String(Date.now()))
  },
  get(): string | null {
    return authService.getAuth()?.auth_code || null
  },
  clear(): void {
    authService.clear()
    localStorage.removeItem('toolbox_login_time')
    void window.electronAPI?.credentialStore?.clearUserCode().catch(() => undefined)
  },
  check(): boolean {
    return Boolean(this.get())
  },
}

export function calculateCountdown(targetDate: string | number | Date): { text: string; expired: boolean } {
  const distance = new Date(targetDate).getTime() - Date.now()
  if (distance <= 0) return { text: '已到期', expired: true }
  const days = Math.floor(distance / (1000 * 60 * 60 * 24))
  const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))
  return { text: `${days}天${hours}时${minutes}分`, expired: false }
}

export function formatTime(time: string | number | Date | null | undefined): string {
  if (!time) return '-'
  const date = new Date(time)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function formatDate(time: string | number | Date | null | undefined): string {
  return time ? new Date(time).toLocaleDateString('zh-CN') : '-'
}

export function getDeviceId(): string {
  let deviceId = localStorage.getItem('toolbox_device_id')
  if (!deviceId) {
    deviceId = window.electronAPI?.runtime?.deviceId
      || `DEV-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
    localStorage.setItem('toolbox_device_id', deviceId)
  }
  return deviceId
}

export function getDeviceName(): string {
  let deviceName = localStorage.getItem('toolbox_device_name')
  if (!deviceName) {
    deviceName = window.electronAPI?.runtime?.deviceName
      || `DESKTOP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    localStorage.setItem('toolbox_device_name', deviceName)
  }
  return deviceName
}
