import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import { app } from 'electron'
import { CancellationToken, autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'restart_deferred'
  | 'installing'
  | 'cancelled'
  | 'error'

interface UpdateSnapshot {
  status: UpdateStatus
  currentVersion: string
  availableVersion?: string
  releaseDate?: string
  releaseNotes: string[]
  percent?: number
  transferredBytes?: number
  totalBytes?: number
  errorCode?: string
  canRestart: boolean
}

interface UpdateManagerOptions {
  ipcMain: IpcMain
  getWindow: () => BrowserWindow | null | undefined
  hasActiveWork: () => boolean
  beforeInstall: () => void
  updater?: typeof autoUpdater
}

const CHANNELS = {
  getState: 'updates:get-state',
  check: 'updates:check',
  startDownload: 'updates:start-download',
  cancelDownload: 'updates:cancel-download',
  install: 'updates:install',
  defer: 'updates:defer',
  state: 'updates:state',
} as const

function normalizeReleaseNotes(notes: UpdateInfo['releaseNotes']): string[] {
  if (typeof notes === 'string') {
    return notes.split(/\r?\n/).map(line => line.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
  }
  if (!Array.isArray(notes)) return []
  return notes
    .flatMap(note => typeof note.note === 'string' ? note.note.split(/\r?\n/) : [])
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

function errorCode(error: unknown): string {
  if (error instanceof Error) return error.name || 'UPDATE_ERROR'
  return 'UPDATE_ERROR'
}

export class UpdateManager {
  private readonly ipcMain: IpcMain
  private readonly getWindow: () => BrowserWindow | null | undefined
  private readonly hasActiveWork: () => boolean
  private readonly beforeInstall: () => void
  private readonly updater: typeof autoUpdater
  private checking: Promise<UpdateSnapshot> | null = null
  private cancellationToken: CancellationToken | null = null
  private updateInfo: UpdateInfo | null = null
  private deferredForSession = false
  private cleanupStarted = false
  private snapshot: UpdateSnapshot

  constructor(options: UpdateManagerOptions) {
    this.ipcMain = options.ipcMain
    this.getWindow = options.getWindow
    this.hasActiveWork = options.hasActiveWork
    this.beforeInstall = options.beforeInstall
    this.updater = options.updater ?? autoUpdater
    this.snapshot = {
      status: 'idle',
      currentVersion: app.getVersion(),
      releaseNotes: [],
      canRestart: false,
    }
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = true
    this.bindUpdaterEvents()
    this.registerIpc()
  }

  getState(): UpdateSnapshot {
    return { ...this.snapshot, releaseNotes: [...this.snapshot.releaseNotes] }
  }

  async check(options: { manual?: boolean } = {}): Promise<UpdateSnapshot> {
    if (this.checking) return this.checking
    if (this.deferredForSession && !options.manual) return this.getState()
    if (this.snapshot.status === 'downloading' || this.snapshot.status === 'installing') return this.getState()

    this.setState({ status: 'checking', errorCode: undefined })
    this.checking = this.updater.checkForUpdates()
      .then(() => this.getState())
      .catch((error: unknown) => {
        this.setState({ status: 'error', errorCode: errorCode(error) })
        return this.getState()
      })
      .finally(() => { this.checking = null })
    return this.checking
  }

  async startDownload(): Promise<UpdateSnapshot> {
    if (this.snapshot.status === 'downloading') return this.getState()
    if (!this.updateInfo) throw new Error('当前没有可下载的更新')
    this.cancellationToken = new CancellationToken()
    this.setState({ status: 'downloading', percent: 0, transferredBytes: 0, errorCode: undefined })
    try {
      await this.updater.downloadUpdate(this.cancellationToken)
    } catch (error: unknown) {
      if (this.cancellationToken?.cancelled) {
        this.setState({ status: 'cancelled', errorCode: undefined })
      } else {
        this.setState({ status: 'error', errorCode: errorCode(error) })
      }
    } finally {
      this.cancellationToken = null
    }
    return this.getState()
  }

  cancelDownload(): UpdateSnapshot {
    this.cancellationToken?.cancel()
    if (this.snapshot.status === 'downloading') this.setState({ status: 'cancelled', errorCode: undefined })
    return this.getState()
  }

  defer(): UpdateSnapshot {
    this.deferredForSession = true
    if (this.snapshot.status === 'available') this.setState({ status: 'idle' })
    if (this.snapshot.status === 'downloaded') this.setState({ status: 'restart_deferred', canRestart: !this.hasActiveWork() })
    return this.getState()
  }

  install(): UpdateSnapshot {
    if (!['downloaded', 'restart_deferred'].includes(this.snapshot.status)) return this.getState()
    if (this.hasActiveWork()) {
      this.setState({ status: 'restart_deferred', canRestart: false })
      return this.getState()
    }
    this.setState({ status: 'installing', canRestart: false })
    this.prepareForInstall()
    setImmediate(() => this.updater.quitAndInstall(false, true))
    return this.getState()
  }

  activityChanged(): void {
    if (!['downloaded', 'restart_deferred'].includes(this.snapshot.status)) return
    const canRestart = !this.hasActiveWork()
    this.setState({ status: canRestart ? 'downloaded' : 'restart_deferred', canRestart })
  }

  private bindUpdaterEvents(): void {
    const lifecycleUpdater = this.updater as unknown as {
      on(event: 'before-quit-for-update', listener: () => void): void
    }
    lifecycleUpdater.on('before-quit-for-update', () => this.prepareForInstall())
    this.updater.on('update-available', (info: UpdateInfo) => {
      this.updateInfo = info
      this.setState({
        status: this.deferredForSession ? 'idle' : 'available',
        availableVersion: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        canRestart: false,
      })
    })
    this.updater.on('update-not-available', () => this.setState({ status: 'idle', canRestart: false }))
    this.updater.on('download-progress', (progress: ProgressInfo) => this.setState({
      status: 'downloading',
      percent: Math.max(0, Math.min(100, Math.round(progress.percent * 10) / 10)),
      transferredBytes: progress.transferred,
      totalBytes: progress.total,
    }))
    this.updater.on('update-downloaded', (info: UpdateInfo) => {
      this.updateInfo = info
      const canRestart = !this.hasActiveWork()
      this.setState({
        status: canRestart ? 'downloaded' : 'restart_deferred',
        availableVersion: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        percent: 100,
        canRestart,
      })
    })
    this.updater.on('error', (error: Error) => {
      if (this.cancellationToken?.cancelled) return
      this.setState({ status: 'error', errorCode: errorCode(error), canRestart: false })
    })
  }

  private registerIpc(): void {
    const register = (channel: string, handler: (event: IpcMainInvokeEvent) => UpdateSnapshot | Promise<UpdateSnapshot>) => {
      this.ipcMain.handle(channel, (event: IpcMainInvokeEvent) => {
        this.assertTrustedSender(event)
        return handler(event)
      })
    }
    register(CHANNELS.getState, () => this.getState())
    register(CHANNELS.check, () => this.check({ manual: true }))
    register(CHANNELS.startDownload, () => this.startDownload())
    register(CHANNELS.cancelDownload, () => this.cancelDownload())
    register(CHANNELS.install, () => this.install())
    register(CHANNELS.defer, () => this.defer())
  }

  private assertTrustedSender(event: IpcMainInvokeEvent): void {
    const window = this.getWindow()
    if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id) {
      throw new Error('拒绝来自未知窗口的更新请求')
    }
  }

  private setState(patch: Partial<UpdateSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    const window = this.getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(CHANNELS.state, this.getState())
  }

  private prepareForInstall(): void {
    if (this.cleanupStarted) return
    this.cleanupStarted = true
    this.beforeInstall()
  }
}
