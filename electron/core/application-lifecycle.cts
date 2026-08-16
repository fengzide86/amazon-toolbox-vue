import { app, type Event } from 'electron'

interface UpdateLifecycle {
  install(): Promise<unknown>
  isInstalling(): boolean
  shouldInstallOnQuit(): boolean
}

interface ApplicationLifecycleOptions {
  cleanup: () => Promise<void>
  dispose: () => void
  getUpdateManager: () => UpdateLifecycle | null | undefined
  errorMessage: (error: unknown, fallback?: string) => string
}

/** Coordinates normal quit and updater-driven quit through one cleanup path. */
export class ApplicationLifecycleCoordinator {
  private readonly options: ApplicationLifecycleOptions
  private shutdownReady = false
  private shutdownPromise: Promise<void> | null = null

  constructor(options: ApplicationLifecycleOptions) {
    this.options = options
  }

  register(): void {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })
    app.on('before-quit', (event: Event) => this.handleBeforeQuit(event))
  }

  async prepareForInstall(): Promise<void> {
    await this.options.cleanup()
    this.shutdownReady = true
  }

  private handleBeforeQuit(event: Event): void {
    if (this.shutdownReady) {
      this.options.dispose()
      return
    }
    event.preventDefault()
    const updateManager = this.options.getUpdateManager()
    if (updateManager?.shouldInstallOnQuit() && !updateManager.isInstalling()) {
      void updateManager.install()
      return
    }
    if (this.shutdownPromise) return
    this.shutdownPromise = this.options.cleanup()
      .catch(error => console.error('[Shutdown] Cleanup failed:', this.options.errorMessage(error)))
      .finally(() => {
        this.shutdownReady = true
        app.quit()
      })
  }
}
