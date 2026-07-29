import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { extractFile } from '@electron/asar'

const root = process.cwd()
const asarPath = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar')
const backendPath = path.join(root, 'release', 'win-unpacked', 'resources', 'toolbox-backend.exe')

if (!fs.existsSync(asarPath)) throw new Error(`Packaged app not found: ${asarPath}`)
if (fs.existsSync(backendPath)) throw new Error('Internal production package must not contain the embedded backend')

const asarCli = path.join(root, 'node_modules', '@electron', 'asar', 'bin', 'asar.js')
const asarOutput = execFileSync(process.execPath, [asarCli, 'list', asarPath], { cwd: root, encoding: 'utf8' })
const entries = asarOutput
  .split(/\r?\n/)
  .filter(Boolean)

const forbidden = entries.filter(entry => {
  const normalized = entry.replaceAll('\\', '/')
  if (/(?:^|\/)toolbox-backend\.exe$/i.test(normalized)) return true
  if (/\.(?:ts|cts|map)$/i.test(normalized)) return true
  if (/(?:^|\/)(?:tests?|docs)(?:\/|$)/i.test(normalized)) return true
  if (/(?:^|\/)smoke(?:\/|$)/i.test(normalized)) return true
  if (/^\/?scripts(?:\/|$)/i.test(normalized)) return true
  return /(?:admin_)?token\.txt$/i.test(normalized)
})

const requiredAutomationEntries = [
  '/dist-electron/electron/automation-runner.cjs',
  '/dist-electron/electron/automation/adapter-loader.cjs',
  '/dist-electron/electron/automation/scripts/registry.cjs',
]
const missingAutomationEntries = requiredAutomationEntries.filter(required => (
  !entries.some(entry => entry.replaceAll('\\', '/').endsWith(required))
))
if (missingAutomationEntries.length) {
  throw new Error(`Missing packaged automation runtime:\n${missingAutomationEntries.join('\n')}`)
}

if (forbidden.length) {
  throw new Error(`Forbidden package entries:\n${forbidden.slice(0, 30).join('\n')}`)
}

function packagedSource(filename: string): string {
  return extractFile(asarPath, filename).toString('utf8')
}

const mainSource = [
  packagedSource(path.join('dist-electron', 'electron', 'main.cjs')),
  packagedSource(path.join('dist-electron', 'electron', 'desktop-application.cjs')),
].join('\n')
const preloadSource = packagedSource(path.join('dist-electron', 'electron', 'preload.cjs'))
const updateManagerSource = packagedSource(path.join('dist-electron', 'electron', 'core', 'update-manager.cjs'))
const indexSource = packagedSource(path.join('dist', 'index.html'))
const internalPolicyFailures: string[] = []

if (!mainSource.includes("packageMetadata.toolbox?.distribution === 'internal'")) {
  internalPolicyFailures.push('internal distribution gate')
}
if (!mainSource.includes('webviewTag: AUTOMATION_RUNTIME_ENABLED')
  || !mainSource.includes('if (!AUTOMATION_RUNTIME_ENABLED')) {
  internalPolicyFailures.push('webview runtime gate')
}
if (mainSource.includes('webviewTag: true')) internalPolicyFailures.push('unconditional webview capability')
if (!/if\s*\(AUTOMATION_RUNTIME_ENABLED\)\s*registerTrustedOn\('launch-tool'/.test(mainSource)) {
  internalPolicyFailures.push('tool launch IPC gate')
}
const conditionalBridge = preloadSource.indexOf('...(automationEnabled ?')
const launchBridge = preloadSource.indexOf('launchTool:')
const conditionalBridgeEnd = preloadSource.indexOf('} : {})', launchBridge)
if (conditionalBridge < 0 || launchBridge < conditionalBridge || conditionalBridgeEnd < launchBridge) {
  internalPolicyFailures.push('tool launch preload gate')
}
if (!preloadSource.includes("'demo-activity:set-active'")) {
  internalPolicyFailures.push('demo activity update lock bridge')
}
if (!updateManagerSource.includes('this.updater.autoInstallOnAppQuit = false')) {
  internalPolicyFailures.push('automatic install-on-quit disabled')
}
if (!mainSource.includes("window.loadURL('app://toolbox/index.html')")) {
  internalPolicyFailures.push('app protocol renderer entrypoint')
}
const csp = indexSource.match(/http-equiv=["']Content-Security-Policy["'][^>]*content=(["'])(.*?)\1/i)?.[2] || ''
const scriptPolicy = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/i)?.[1] || ''
if (!scriptPolicy || scriptPolicy.includes("'unsafe-inline'") || scriptPolicy.includes("'unsafe-eval'")) {
  internalPolicyFailures.push('strict renderer script CSP')
}
if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(indexSource)) {
  internalPolicyFailures.push('inline renderer script')
}
if (!indexSource.includes('startup-loading')) internalPolicyFailures.push('static startup fallback')
if (internalPolicyFailures.length) {
  throw new Error(`Missing internal desktop runtime policy: ${internalPolicyFailures.join(', ')}`)
}

console.log(`package_entries=${entries.length}`)
console.log('package_forbidden_entries=0')
console.log('package_internal_runtime_policy=verified')
