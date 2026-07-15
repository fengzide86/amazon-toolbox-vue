import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron'

type IpcEvent = IpcMainEvent | IpcMainInvokeEvent

export function assertTrustedSender(event: IpcEvent, getWindow: () => BrowserWindow | null | undefined): void {
  const window = getWindow()
  if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id) {
    throw new Error('IPC sender is not the active toolbox window')
  }
  const url = event.senderFrame?.url ?? event.sender.getURL()
  const trusted = url.startsWith('app://toolbox/') || url.startsWith('http://localhost:3000/')
  if (!trusted) throw new Error('IPC sender origin is not trusted')
}
