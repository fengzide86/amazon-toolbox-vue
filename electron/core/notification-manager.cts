import { Notification, type BrowserWindow } from 'electron'

export interface NotificationFocus {
  mode: 'single' | 'batch'
  itemId?: string
}

interface ActionNotification {
  title: string
  body: string
  focus: NotificationFocus
}

interface NotificationManagerOptions {
  getWindow: () => BrowserWindow | null | undefined
  getSelectedBatchItemId: () => string | null
}

export class NotificationManager {
  private readonly getWindow: () => BrowserWindow | null | undefined
  private readonly getSelectedBatchItemId: () => string | null
  private readonly emitted = new Set<string>()

  constructor(options: NotificationManagerOptions) {
    this.getWindow = options.getWindow
    this.getSelectedBatchItemId = options.getSelectedBatchItemId
  }

  show(input: ActionNotification): void {
    if (!Notification.isSupported()) return
    const window = this.getWindow()
    if (window?.isFocused() && input.focus.mode === 'single') return
    if (window?.isFocused() && input.focus.mode === 'batch' && input.focus.itemId === this.getSelectedBatchItemId()) return

    const key = `${input.focus.mode}:${input.focus.itemId ?? 'single'}:${input.title}`
    if (this.emitted.has(key)) return
    this.emitted.add(key)

    const notification = new Notification({ title: input.title, body: input.body, silent: false })
    notification.on('click', () => {
      const activeWindow = this.getWindow()
      if (!activeWindow || activeWindow.isDestroyed()) return
      if (activeWindow.isMinimized()) activeWindow.restore()
      activeWindow.show()
      activeWindow.focus()
      activeWindow.webContents.send('toolbox:notification-focus', input.focus)
    })
    notification.show()
  }

  clear(mode?: NotificationFocus['mode'], itemId?: string): void {
    if (!mode) { this.emitted.clear(); return }
    const prefix = `${mode}:${itemId ?? 'single'}:`
    for (const key of this.emitted) if (key.startsWith(prefix)) this.emitted.delete(key)
  }
}
