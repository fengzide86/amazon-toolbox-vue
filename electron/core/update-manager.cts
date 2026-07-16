import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import { app } from 'electron'
import { readFileSync, rmSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
  downloadBytes?: number
  percent?: number
  transferredBytes?: number
  totalBytes?: number
  promptSuppressedUntil?: string
  errorCode?: string
  canRestart: boolean
}

interface UpdateDeferRequest { phase?: 'download' | 'install' }
interface UpdatePreferences { version?: string; promptSuppressedUntil?: string }
const DAY_MS = 24 * 60 * 60 * 1000

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
  private manualCheckRequested = false
  private preferences: UpdatePreferences
  private cleanupStarted = false
  private snapshot: UpdateSnapshot

  constructor(options: UpdateManagerOptions) {
    this.ipcMain = options.ipcMain
    this.getWindow = options.getWindow
    this.hasActiveWork = options.hasActiveWork
    this.beforeInstall = options.beforeInstall
    this.updater = options.updater ?? autoUpdater
    this.preferences = this.readPreferences()
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
    if (this.snapshot.status === 'downloading' || this.snapshot.status === 'installing') return this.getState()

    this.manualCheckRequested = Boolean(options.manual)
    if (options.manual) this.clearPromptSuppression()
    this.setState({ status: 'checking', errorCode: undefined })
    this.checking = this.updater.checkForUpdates()
      .then(() => this.getState())
      .catch((error: unknown) => {
        if (options.manual) this.setState({ status: 'error', errorCode: errorCode(error) })
        else {
          console.warn('[Update] Automatic update check failed:', error)
          this.setState({ status: 'idle', errorCode: undefined })
        }
        return this.getState()
      })
      .finally(() => { this.checking = null; this.manualCheckRequested = false })
    return this.checking
  }

  async startDownload(): Promise<UpdateSnapshot> {
    if (this.snapshot.status === 'downloading') return this.getState()
    if (!this.updateInfo) throw new Error('当前没有可下载的更新')
    this.cancellationToken = new CancellationToken()
    this.setState({ status: 'downloading', percent: 0, transferredBytes: 0, promptSuppressedUntil: undefined, errorCode: undefined })
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

  defer(request: UpdateDeferRequest = {}): UpdateSnapshot {
    if (request.phase === 'download' && this.snapshot.availableVersion) {
      const promptSuppressedUntil = new Date(Date.now() + DAY_MS).toISOString()
      this.preferences = { version: this.snapshot.availableVersion, promptSuppressedUntil }
      this.writePreferences()
      this.setState({ promptSuppressedUntil })
    }
    if (request.phase === 'install' && this.snapshot.status === 'downloaded') {
      this.setState({ status: 'restart_deferred', canRestart: !this.hasActiveWork() })
    }
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
      const promptSuppressedUntil = this.suppressionFor(info.version)
      this.setState({
        status: 'available',
        availableVersion: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        downloadBytes: info.files.find(file => typeof file.size === 'number')?.size,
        promptSuppressedUntil,
        canRestart: false,
      })
    })
    this.updater.on('update-not-available', () => {
      this.updateInfo = null
      this.setState({
        status: 'idle', availableVersion: undefined, releaseDate: undefined, releaseNotes: [],
        downloadBytes: undefined, promptSuppressedUntil: undefined, canRestart: false,
      })
    })
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
        downloadBytes: info.files.find(file => typeof file.size === 'number')?.size,
        percent: 100,
        promptSuppressedUntil: undefined,
        canRestart,
      })
    })
    this.updater.on('error', (error: Error) => {
      if (this.cancellationToken?.cancelled) return
      if (this.snapshot.status === 'checking' && !this.manualCheckRequested) {
        this.setState({ status: 'idle', errorCode: undefined, canRestart: false })
      } else {
        this.setState({ status: 'error', errorCode: errorCode(error), canRestart: false })
      }
    })
  }

  private registerIpc(): void {
    const register = (channel: string, handler: (event: IpcMainInvokeEvent, request?: UpdateDeferRequest) => UpdateSnapshot | Promise<UpdateSnapshot>) => {
      this.ipcMain.handle(channel, (event: IpcMainInvokeEvent, request?: UpdateDeferRequest) => {
        this.assertTrustedSender(event)
        return handler(event, request)
      })
    }
    register(CHANNELS.getState, () => this.getState())
    register(CHANNELS.check, () => this.check({ manual: true }))
    register(CHANNELS.startDownload, () => this.startDownload())
    register(CHANNELS.cancelDownload, () => this.cancelDownload())
    register(CHANNELS.install, () => this.install())
    register(CHANNELS.defer, (_event, request) => this.defer(request))
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

  private preferencesPath(): string {
    return join(app.getPath('userData'), 'update-preferences.json')
  }

  private readPreferences(): UpdatePreferences {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.preferencesPath(), 'utf8'))
      return parsed && typeof parsed === 'object' ? parsed as UpdatePreferences : {}
    } catch {
      return {}
    }
  }

  private writePreferences(): void {
    try {
      const target = this.preferencesPath()
      const temp = `${target}.tmp`
      writeFileSync(temp, JSON.stringify(this.preferences), 'utf8')
      rmSync(target, { force: true })
      renameSync(temp, target)
    } catch (error) {
      console.warn('[Update] Could not persist prompt preference:', error)
    }
  }

  private clearPromptSuppression(): void {
    if (!this.preferences.version && !this.preferences.promptSuppressedUntil) return
    this.preferences = {}
    this.writePreferences()
    this.setState({ promptSuppressedUntil: undefined })
  }

  private suppressionFor(version: string): string | undefined {
    if (this.preferences.version !== version || !this.preferences.promptSuppressedUntil) return undefined
    return Date.parse(this.preferences.promptSuppressedUntil) > Date.now()
      ? this.preferences.promptSuppressedUntil
      : undefined
  }
}
