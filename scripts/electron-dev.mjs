import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteUrl = 'http://127.0.0.1:3000'
const electronCommand = process.platform === 'win32'
  ? path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(projectRoot, 'node_modules', '.bin', 'electron')
const viteEntry = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')

let viteProcess
let electronProcess
let stopping = false

function npmInvocation(args) {
  if (process.platform !== 'win32') return { command: 'npm', args }
  const command = process.env.ComSpec || 'cmd.exe'
  const commandLine = ['npm', ...args].join(' ')
  return { command, args: ['/d', '/s', '/c', commandLine] }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} exited with signal ${signal}`))
      else if (code !== 0) reject(new Error(`${command} exited with code ${code}`))
      else resolve()
    })
  })
}

async function viteIsReady() {
  try {
    const response = await fetch(viteUrl, { signal: AbortSignal.timeout(1_500) })
    if (!response.ok) return false
    const html = await response.text()
    return html.includes('/src/main.ts') || html.includes('id="app"')
  } catch {
    return false
  }
}

async function waitForVite(timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs
  let nextProgressNotice = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (await viteIsReady()) return
    if (viteProcess && viteProcess.exitCode !== null) {
      throw new Error(`Vite exited before it became ready (code ${viteProcess.exitCode})`)
    }
    if (Date.now() >= nextProgressNotice) {
      console.log('[DEV] Vite is still preparing dependencies; the first launch can take 2-3 minutes...')
      nextProgressNotice = Date.now() + 15_000
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Vite did not become ready at ${viteUrl} within ${timeoutMs / 1000} seconds`)
}

function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  } else {
    child.kill('SIGTERM')
  }
}

function cleanup() {
  if (stopping) return
  stopping = true
  stopProcessTree(electronProcess)
  stopProcessTree(viteProcess)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    cleanup()
    process.exitCode = signal === 'SIGINT' ? 130 : 143
  })
}

async function main() {
  if (!existsSync(electronCommand)) {
    throw new Error('Electron is not installed. Run npm ci first.')
  }
  if (!existsSync(viteEntry)) {
    throw new Error('Vite is not installed. Run npm ci first.')
  }

  console.log('[DEV] Compiling the Electron main process...')
  const compile = npmInvocation(['run', 'electron:compile'])
  await run(compile.command, compile.args)

  if (await viteIsReady()) {
    console.log(`[DEV] Reusing the existing Vite server at ${viteUrl}`)
  } else {
    console.log(`[DEV] Starting Vite at ${viteUrl}`)
    viteProcess = spawn(
      process.execPath,
      [viteEntry, '--mode', 'development', '--host', '127.0.0.1', '--port', '3000', '--strictPort'],
      {
        cwd: projectRoot,
        env: process.env,
        stdio: 'inherit',
        windowsHide: true,
      },
    )
    viteProcess.once('error', error => {
      console.error('[DEV] Vite failed to start:', error.message)
    })
    await waitForVite()
  }

  console.log('[DEV] Opening Electron. Close the app to stop the preview server.')
  const electronEnvironment = { ...process.env, NODE_ENV: 'development' }
  delete electronEnvironment.ELECTRON_RUN_AS_NODE
  electronProcess = spawn(electronCommand, ['.'], {
    cwd: projectRoot,
    env: electronEnvironment,
    stdio: 'inherit',
    windowsHide: false,
  })

  const exitCode = await new Promise((resolve, reject) => {
    electronProcess.once('error', reject)
    electronProcess.once('exit', (code, signal) => {
      if (signal && !stopping) reject(new Error(`Electron exited with signal ${signal}`))
      else resolve(code ?? 0)
    })
  })
  if (exitCode !== 0) throw new Error(`Electron exited with code ${exitCode}`)
}

try {
  await main()
} catch (error) {
  console.error('[DEV] Preview failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  cleanup()
}
