import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index < 0 ? fallback : process.argv[index + 1]
}
const executable = path.resolve(argument('--executable', ''))
const root = path.resolve(argument('--root', ''))
const mode = argument('--mode', 'check')
const expectedVersion = argument('--version', '')
assert.ok(['seed', 'check'].includes(mode), 'Mode must be seed or check')
assert.ok(executable.endsWith('.exe') && existsSync(executable), 'Packaged executable is required')
assert.match(root, /^D:\\.*kst-(?:nsis|runtime)-smoke-[a-f0-9]+$/i, 'Use a unique isolated D: smoke root')
const marker = path.join(root, 'smoke-owner.json')
assert.ok(existsSync(marker), 'Caller must create a smoke-owner.json in the isolated root')
const runtimeRoot = path.join(root, 'user-data')
const baselinePath = path.join(root, 'baseline.json')
mkdirSync(runtimeRoot, { recursive: true })
const credential = 'KST-UPGRADE-FIXTURE-NOT-A-REAL-AUTHORIZATION'
const preferences = { version: '99.0.0', promptSuppressedUntil: '2099-01-01T00:00:00.000Z' }
const server = createServer((_request, response) => {
  response.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  response.end('{"detail":"isolated desktop acceptance; no production request"}')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const api = `http://localhost:${server.address().port}`
const environment = { ...process.env, TOOLBOX_RUNTIME_DIR: runtimeRoot,
  TOOLBOX_CONTROL_API_URL: api, TOOLBOX_USE_BUNDLED_BACKEND: 'false',
  TOOLBOX_RUNNER_MOCK: 'true', NODE_ENV: 'production' }
delete environment.ELECTRON_RUN_AS_NODE
let application
const diagnostic = { mode, expectedVersion, checks: [], errors: [] }
const fingerprint = file => createHash('sha256').update(readFileSync(file)).digest('hex')
try {
  application = await electron.launch({ executablePath: executable, env: environment, timeout: 30_000 })
  const runtimeLog = []
  application.process().stderr?.on('data', data => { runtimeLog.push(String(data)); if (runtimeLog.length > 20) runtimeLog.shift() })
  diagnostic.runtimeLog = runtimeLog
  // Redirect the existing updater in the test process only, before its delayed check.
  // No test hook or alternative execution path is shipped in the production app.
  await application.evaluate(({ app, BrowserWindow }, feed) => {
    process.mainModule.require('electron-updater').autoUpdater.setFeedURL({ provider: 'generic', url: feed })
    for (const window of BrowserWindow.getAllWindows()) window.hide()
    BrowserWindow.getAllWindows()[0]?.webContents.session.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
        const host = new URL(details.url).hostname
        callback({ cancel: host !== '127.0.0.1' && host !== 'localhost' })
      },
    )
    if (!app.isPackaged) throw new Error('Must inspect an actually packaged application')
  }, api)
  const window = await application.firstWindow()
  window.on('pageerror', error => diagnostic.errors.push(error.message))
  await window.waitForFunction(() => Boolean(document.querySelector('#app')?.firstElementChild)
    && !document.querySelector('.startup-loading'), null,
  { timeout: 20_000 })
  assert.match(window.url(), /^app:\/\/toolbox\//)
  const runtime = await application.evaluate(({ app }) => ({ version: app.getVersion(), root: app.getPath('userData') }))
  assert.equal(runtime.version, expectedVersion)
  assert.equal(path.resolve(runtime.root), runtimeRoot)
  const bridge = await window.evaluate(() => Boolean(window.electronAPI?.runtime?.deviceId))
  const legacyBaseline = mode === 'seed' && expectedVersion === '1.8.5' && !bridge
  if (!bridge && !legacyBaseline) throw new Error('Packaged preload bridge is unavailable')
  // The released 1.8.5 had a broken sandbox preload. Keep the binary unchanged:
  // seed its real credential format via the same Electron safeStorage codec.
  const deviceId = bridge
    ? await window.evaluate(() => window.electronAPI.runtime.deviceId)
    : await application.evaluate(() => {
      // This is the exact identity formula verified in the pinned 1.8.5 ASAR.
      const os = process.mainModule.require('node:os')
      const crypto = process.mainModule.require('node:crypto')
      return `DEV-${crypto.createHash('sha256').update([os.hostname(), os.homedir(), os.platform(), os.arch()].join('|')).digest('hex').slice(0, 20).toUpperCase()}`
    })
  assert.match(deviceId, /^DEV-[A-F0-9]{20}$/)
  diagnostic.checks.push('installed app:// renderer', 'isolated userData', 'packaged version')
  if (bridge) {
    assert.equal(await window.evaluate(() => window.electronAPI.runtime.controlApiBase), api)
    assert.deepEqual(await window.evaluate(() => window.electronAPI.batch.getSnapshot()), { status: 'idle', items: [] })
    diagnostic.checks.push('preload runtime', 'preload batch IPC')
  } else diagnostic.knownOldVersionDefect = 'Released 1.8.5 sandbox preload unavailable; old credential fixture seeded through safeStorage, not old IPC'

  if (mode === 'seed') {
    if (legacyBaseline) {
      await application.evaluate(({ app, safeStorage }, code) => {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Old runtime encryption unavailable')
        const fs = process.mainModule.require('node:fs')
        const path = process.mainModule.require('node:path')
        fs.writeFileSync(path.join(app.getPath('userData'), 'user-credential.bin'), safeStorage.encryptString(code))
      }, credential)
    } else assert.equal(await window.evaluate(code => window.electronAPI.credentialStore.saveUserCode(code), credential), true)
    await window.evaluate(() => {
      localStorage.setItem('kst_upgrade_marker', 'preserve-renderer-storage')
      localStorage.setItem('toolbox_current_platform', 'aliexpress')
    })
    await application.evaluate(({ session }) => session.defaultSession.flushStorageData())
    writeFileSync(path.join(runtimeRoot, 'update-preferences.json'), JSON.stringify(preferences))
    writeFileSync(path.join(runtimeRoot, 'customer-file.txt'), 'Customer-owned upgrade preservation sentinel')
    writeFileSync(baselinePath, JSON.stringify({ version: runtime.version, deviceId,
      credentialHash: fingerprint(path.join(runtimeRoot, 'user-credential.bin')),
      preferencesHash: fingerprint(path.join(runtimeRoot, 'update-preferences.json')),
      customerHash: fingerprint(path.join(runtimeRoot, 'customer-file.txt')) }, null, 2))
    diagnostic.checks.push('old-version credential / settings / user file seeded')
  } else {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
    assert.equal(deviceId, baseline.deviceId, 'Stable device ID must survive application replacement')
    assert.equal(await window.evaluate(() => window.electronAPI.credentialStore.loadUserCode()), credential)
    assert.equal(await window.evaluate(() => localStorage.getItem('kst_upgrade_marker')), 'preserve-renderer-storage')
    assert.equal(await window.evaluate(() => localStorage.getItem('toolbox_current_platform')), 'aliexpress')
    assert.equal(fingerprint(path.join(runtimeRoot, 'user-credential.bin')), baseline.credentialHash)
    assert.equal(fingerprint(path.join(runtimeRoot, 'update-preferences.json')), baseline.preferencesHash)
    assert.equal(fingerprint(path.join(runtimeRoot, 'customer-file.txt')), baseline.customerHash)
    diagnostic.checks.push('device ID preserved', 'encrypted credential decrypts', 'renderer settings preserved',
      'updater preferences preserved', 'customer file preserved')
  }
  await application.close()
  application = undefined

  // Fork from the installed ASAR with its own Electron executable: not dist-electron/ from the checkout.
  const events = []
  await new Promise((resolve, reject) => {
    const child = fork(path.join(path.dirname(executable), 'resources/app.asar/dist-electron/electron/automation-runner.cjs'), [], {
      execPath: executable, env: { ...environment, ELECTRON_RUN_AS_NODE: '1',
        TOOLBOX_PROFILE_ROOT: path.join(root, 'runner-profiles'), TOOLBOX_ARTIFACT_ROOT: path.join(root, 'runner-artifacts'),
        TOOLBOX_MIN_ACTION_INTERVAL_MS: '5' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    let settled = false
    const finish = error => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.kill()
      if (error) reject(error)
      else resolve()
    }
    const timeout = setTimeout(() => finish(new Error('Installed Runner exceeded 30 seconds')), 30_000)
    child.on('error', finish)
    child.on('exit', code => { if (!settled) finish(new Error(`Installed Runner exited prematurely: ${code}`)) })
    child.on('message', message => {
      if (message?.type !== 'event') return
      events.push(message.event?.type)
      if (message.event?.type === 'run.completed') finish()
      if (message.event?.type === 'run.failed') finish(new Error('Installed Demo Runner reported failure'))
    })
    child.send({ type: 'command', id: 'upgrade-probe', command: 'start', payload: { tool: {
      id: 'upgrade-probe', name: 'Isolated installed Runner probe', platformKey: 'amazon', executionMode: 'demo',
      scriptKey: 'demo.listing_script_walkthrough_v1', targetUrl: 'demo://amazon/listing_script',
      executionContext: { mode: 'single', sessionId: 'upgrade-probe', input: {} },
    } } })
  })
  assert.ok(events.includes('run.completed'))
  diagnostic.checks.push('installed ASAR Runner Demo completion')
  diagnostic.status = 'passed'
  console.log(`packaged_runtime_${mode}=passed (${diagnostic.checks.length} assertions/groups)`)
} catch (error) {
  diagnostic.status = 'failed'
  diagnostic.errors.push(error instanceof Error ? error.message : String(error))
  if (application) {
    const window = await application.firstWindow().catch(() => null)
    if (window) {
      diagnostic.rendererConsole = (await window.consoleMessages().catch(() => [])).map(item => item.text()).slice(-20)
      diagnostic.page = await window.evaluate(() => ({ url: location.href, title: document.title,
        text: document.body?.innerText?.slice(0, 1500), preloadKeys: Object.keys(window.electronAPI || {}),
        runtime: window.electronAPI?.runtime })).catch(() => null)
      await window.screenshot({ path: path.join(root, `runtime-${mode}-failure.png`) }).catch(() => undefined)
    }
  }
  throw error
} finally {
  if (application) await application.close().catch(() => application.process().kill())
  await new Promise(resolve => server.close(resolve))
  writeFileSync(path.join(root, `runtime-${mode}.json`), JSON.stringify(diagnostic, null, 2))
}
