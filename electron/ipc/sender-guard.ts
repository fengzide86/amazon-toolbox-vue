import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron'

type IpcEvent = IpcMainEvent | IpcMainInvokeEvent

export function isTrustedRendererUrl(url: string, allowDevelopmentOrigin = false): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'app:' && parsed.hostname === 'toolbox') return true
    return allowDevelopmentOrigin
      && parsed.protocol === 'http:'
      && parsed.hostname === 'localhost'
      && parsed.port === '3000'
  } catch {
    return false
  }
}

export function assertTrustedSender(
  event: IpcEvent,
  getWindow: () => BrowserWindow | null | undefined,
  allowDevelopmentOrigin = false,
): void {
  const window = getWindow()
  if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id) {
    throw new Error('IPC sender is not the active toolbox window')
  }
  const url = event.senderFrame?.url ?? event.sender.getURL()
  if (!isTrustedRendererUrl(url, allowDevelopmentOrigin)) {
    throw new Error('IPC sender origin is not trusted')
  }
}
