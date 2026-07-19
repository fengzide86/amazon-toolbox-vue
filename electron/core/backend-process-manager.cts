import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

interface BackendProcessManagerOptions {
  runtimeRoot: string
  resourcesPath: () => string
}

export class BackendProcessManager {
  private readonly runtimeRoot: string
  private readonly resourcesPath: () => string
  private process: ChildProcess | null = null

  constructor(options: BackendProcessManagerOptions) {
    this.runtimeRoot = options.runtimeRoot
    this.resourcesPath = options.resourcesPath
  }

  async ensure(): Promise<boolean> {
    if (await this.checkHealth()) return true
    this.start()
    return this.waitUntilReady()
  }

  async cleanup(timeoutMs = 3000): Promise<void> {
    const process = this.process
    if (!process) return
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        process.removeListener('exit', onExit)
        if (error) reject(error)
        else {
          if (this.process === process) this.process = null
          resolve()
        }
      }
      const onExit = (): void => finish()
      const timer = setTimeout(() => {
        try {
          if (process.exitCode === null) process.kill('SIGKILL')
        } catch (error) {
          console.error('[BackendManager] Forced shutdown failed:', error)
        }
        finish(Object.assign(new Error('Backend process cleanup timed out'), { code: 'INSTALL_BUSY' }))
      }, timeoutMs)
      process.once('exit', onExit)
      try {
        if (process.exitCode === null) process.kill('SIGTERM')
        else finish()
      } catch (error) {
        console.error('[BackendManager] Graceful shutdown failed:', error)
        finish(error instanceof Error ? error : new Error('Backend process cleanup failed'))
      }
    })
  }

  private checkHealth(timeoutMs = 1200): Promise<boolean> {
    return new Promise(resolve => {
      let settled = false
      const finish = (value: boolean): void => { if (!settled) { settled = true; resolve(value) } }
      const request = http.get('http://localhost:8000/api/health', response => {
        response.resume()
        finish(response.statusCode === 200)
      })
      request.once('error', () => finish(false))
      request.setTimeout(timeoutMs, () => { request.destroy(); finish(false) })
    })
  }

  private async waitUntilReady(maxWaitMs = 15000): Promise<boolean> {
    const startedAt = Date.now()
    while (Date.now() - startedAt <= maxWaitMs) {
      if (await this.checkHealth(1000)) return true
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    return false
  }

  private start(): void {
    const executable = path.join(this.resourcesPath(), 'toolbox-backend.exe')
    if (!fs.existsSync(executable)) { console.error('[BackendManager] Bundled backend is missing:', executable); return }
    const logDirectory = path.join(this.runtimeRoot, 'logs')
    fs.mkdirSync(logDirectory, { recursive: true })
    const log = fs.createWriteStream(path.join(logDirectory, 'backend-error.log'), { flags: 'a' })
    const process = spawn(executable, [], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...globalThis.process.env, TOOLBOX_RUNTIME_DIR: this.runtimeRoot, APPDATA: this.runtimeRoot },
    })
    this.process = process
    process.stdout?.pipe(log)
    process.stderr?.pipe(log)
    process.once('error', error => log.write(`\n[ERROR] ${new Date().toISOString()} ${error.message}\n`))
    process.once('exit', code => {
      if (this.process === process) this.process = null
      if (code !== 0) log.write(`\n[EXIT] ${new Date().toISOString()} exit code: ${code}\n`)
      log.end()
    })
  }
}
