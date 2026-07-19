import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import { app } from 'electron'
import { readFileSync, rmSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CancellationToken, autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import { assertTrustedSender } from '../ipc/sender-guard.js'
import { normalizeUpdateErrorCode, type StableUpdateErrorCode } from './update-errors.js'

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
  supported: boolean
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
  lastCheckedAt?: string
}

interface UpdateDeferRequest { phase?: 'download' | 'install' }
interface UpdatePreferences { version?: string; promptSuppressedUntil?: string }
const DAY_MS = 24 * 60 * 60 * 1000
const CHECK_TIMEOUT_MS = 20000

interface UpdateManagerOptions {
  ipcMain: IpcMain
  getWindow: () => BrowserWindow | null | undefined
  hasActiveWork: () => boolean
  beforeInstall: () => void | Promise<void>
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

export class UpdateManager {
  private readonly ipcMain: IpcMain
  private readonly getWindow: () => BrowserWindow | null | undefined
  private readonly hasActiveWork: () => boolean
  private readonly beforeInstall: () => void | Promise<void>
  private readonly updater: typeof autoUpdater
  private checking: Promise<UpdateSnapshot> | null = null
  private cancellationToken: CancellationToken | null = null
  private updateInfo: UpdateInfo | null = null
  private manualCheckRequested = false
  private preferences: UpdatePreferences
  private cleanupPromise: Promise<void> | null = null
  private installOnQuitApproved = false
  private installPreparing = false
  private checkGeneration = 0
  private activeCheckGeneration = 0
  private acceptCheckEvents = false
  private snapshot: UpdateSnapshot

  constructor(options: UpdateManagerOptions) {
    this.ipcMain = options.ipcMain
    this.getWindow = options.getWindow
    this.hasActiveWork = options.hasActiveWork
    this.beforeInstall = options.beforeInstall
    this.updater = options.updater ?? autoUpdater
    this.preferences = this.readPreferences()
    this.snapshot = {
      supported: app.isPackaged,
      status: 'idle',
      currentVersion: app.getVersion(),
      releaseNotes: [],
      canRestart: false,
    }
    if (this.snapshot.supported) {
      this.updater.autoDownload = false
      // Downloading an update is not consent to install it. Installation only
      // starts after an explicit immediate-restart or install-on-exit action.
      this.updater.autoInstallOnAppQuit = false
      this.bindUpdaterEvents()
    }
    this.registerIpc()
  }

  getState(): UpdateSnapshot {
    return { ...this.snapshot, releaseNotes: [...this.snapshot.releaseNotes] }
  }

  shouldInstallOnQuit(): boolean {
    return this.installOnQuitApproved && ['downloaded', 'restart_deferred'].includes(this.snapshot.status)
  }

  isInstalling(): boolean {
    return this.installPreparing || this.snapshot.status === 'installing'
  }

  async check(options: { manual?: boolean } = {}): Promise<UpdateSnapshot> {
    if (!this.snapshot.supported) return this.getState()
    if (this.checking) return this.checking
    if (this.snapshot.status === 'downloading' || this.snapshot.status === 'installing') return this.getState()

    this.manualCheckRequested = Boolean(options.manual)
    const generation = ++this.checkGeneration
    this.activeCheckGeneration = generation
    this.acceptCheckEvents = true
    if (options.manual) this.clearPromptSuppression()
    this.setState({ status: 'checking', errorCode: undefined })
    let timeout: ReturnType<typeof setTimeout> | undefined
    const checkPromise = this.updater.checkForUpdates()
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(Object.assign(new Error('更新检查超时'), { code: 'UPDATE_CHECK_TIMEOUT' })), CHECK_TIMEOUT_MS)
    })
    this.checking = Promise.race([checkPromise, timeoutPromise])
      .then(() => {
        if (this.activeCheckGeneration !== generation) return this.getState()
        if (this.snapshot.status === 'checking') {
          this.setState({ status: 'idle', errorCode: undefined, lastCheckedAt: new Date().toISOString() })
        }
        return this.getState()
      })
      .catch((error: unknown) => {
        if (this.activeCheckGeneration !== generation) return this.getState()
        this.acceptCheckEvents = false
        if (options.manual) this.setState({ status: 'error', errorCode: normalizeUpdateErrorCode(error, 'CHECK_FAILED') })
        else {
          console.warn('[Update] Automatic update check failed:', error)
          this.setState({ status: 'idle', errorCode: undefined, lastCheckedAt: new Date().toISOString() })
        }
        return this.getState()
      })
      .finally(() => {
        if (timeout) clearTimeout(timeout)
        if (this.activeCheckGeneration === generation) this.activeCheckGeneration = 0
        this.checking = null
        this.manualCheckRequested = false
      })
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
        this.setState({ status: 'error', errorCode: normalizeUpdateErrorCode(error, 'DOWNLOAD_FAILED') })
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
      this.installOnQuitApproved = true
      this.setState({ status: 'restart_deferred', canRestart: !this.hasActiveWork() })
    }
    return this.getState()
  }

  async install(): Promise<UpdateSnapshot> {
    if (!['downloaded', 'restart_deferred'].includes(this.snapshot.status)) return this.getState()
    if (this.installPreparing) return this.getState()
    if (this.hasActiveWork()) {
      this.setState({ status: 'restart_deferred', canRestart: false, errorCode: 'INSTALL_BUSY' })
      return this.getState()
    }
    this.installPreparing = true
    this.setState({ status: 'restart_deferred', canRestart: false, errorCode: undefined })
    try {
      await this.prepareForInstall()
      if (this.hasActiveWork()) {
        throw Object.assign(new Error('Application work remained active after cleanup'), { code: 'INSTALL_BUSY' })
      }
    } catch (error) {
      this.installPreparing = false
      this.cleanupPromise = null
      const errorCode = normalizeUpdateErrorCode(error, 'INSTALL_QUIESCE_FAILED')
      this.setState({
        status: errorCode === 'INSTALL_BUSY' ? 'restart_deferred' : 'error',
        canRestart: false,
        errorCode,
      })
      return this.getState()
    }
    this.installPreparing = false
    this.setState({ status: 'installing', canRestart: false, errorCode: undefined })
    this.installOnQuitApproved = false
    setImmediate(() => {
      try {
        this.updater.quitAndInstall(false, true)
      } catch (error) {
        this.setState({ status: 'error', canRestart: false, errorCode: normalizeUpdateErrorCode(error, 'INSTALL_LAUNCH_FAILED') })
      }
    })
    return this.getState()
  }

  activityChanged(): void {
    if (!['downloaded', 'restart_deferred'].includes(this.snapshot.status)) return
    const canRestart = !this.hasActiveWork()
    this.setState({ status: canRestart ? 'downloaded' : 'restart_deferred', canRestart, errorCode: undefined })
  }

  private bindUpdaterEvents(): void {
    const lifecycleUpdater = this.updater as unknown as {
      on(event: 'before-quit-for-update', listener: () => void): void
    }
    lifecycleUpdater.on('before-quit-for-update', () => {
      void this.prepareForInstall().catch(error => console.error('[Update] Pre-install cleanup failed:', error))
    })
    this.updater.on('update-available', (info: UpdateInfo) => {
      if (!this.acceptCheckEvents) return
      this.installOnQuitApproved = false
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
        lastCheckedAt: new Date().toISOString(),
      })
    })
    this.updater.on('update-not-available', () => {
      if (!this.acceptCheckEvents) return
      this.installOnQuitApproved = false
      this.updateInfo = null
      this.setState({
        status: 'idle', availableVersion: undefined, releaseDate: undefined, releaseNotes: [],
        downloadBytes: undefined, promptSuppressedUntil: undefined, canRestart: false,
        lastCheckedAt: new Date().toISOString(),
      })
    })
    this.updater.on('download-progress', (progress: ProgressInfo) => this.setState({
      status: 'downloading',
      percent: Math.max(0, Math.min(100, Math.round(progress.percent * 10) / 10)),
      transferredBytes: progress.transferred,
      totalBytes: progress.total,
    }))
    this.updater.on('update-downloaded', (info: UpdateInfo) => {
      this.installOnQuitApproved = false
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
        errorCode: undefined,
        canRestart,
      })
    })
    this.updater.on('error', (error: Error) => {
      if (this.cancellationToken?.cancelled) return
      if (this.snapshot.status === 'checking' && !this.acceptCheckEvents) return
      if (this.snapshot.status === 'checking' && !this.manualCheckRequested) {
        this.setState({ status: 'idle', errorCode: undefined, canRestart: false, lastCheckedAt: new Date().toISOString() })
      } else {
        const fallback: StableUpdateErrorCode = this.snapshot.status === 'downloading' ? 'DOWNLOAD_FAILED' : 'UPDATE_ERROR'
        this.setState({ status: 'error', errorCode: normalizeUpdateErrorCode(error, fallback), canRestart: false })
      }
    })
  }

  private registerIpc(): void {
    const register = (channel: string, handler: (event: IpcMainInvokeEvent, request?: UpdateDeferRequest) => UpdateSnapshot | Promise<UpdateSnapshot>) => {
      this.ipcMain.handle(channel, (event: IpcMainInvokeEvent, request?: UpdateDeferRequest) => {
        assertTrustedSender(event, this.getWindow, !app.isPackaged)
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

  private setState(patch: Partial<UpdateSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    const window = this.getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(CHANNELS.state, this.getState())
  }

  private prepareForInstall(): Promise<void> {
    if (!this.cleanupPromise) {
      this.cleanupPromise = Promise.resolve().then(() => this.beforeInstall())
    }
    return this.cleanupPromise
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
