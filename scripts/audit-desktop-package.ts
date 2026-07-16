import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const asarPath = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar')
const backendPath = path.join(root, 'release', 'win-unpacked', 'resources', 'toolbox-backend.exe')

if (!fs.existsSync(asarPath)) throw new Error(`Packaged app not found: ${asarPath}`)
if (!fs.existsSync(backendPath)) throw new Error('Embedded backend executable is missing')

const asarCli = path.join(root, 'node_modules', '@electron', 'asar', 'bin', 'asar.js')
const asarOutput = execFileSync(process.execPath, [asarCli, 'list', asarPath], { cwd: root, encoding: 'utf8' })
const entries = asarOutput
  .split(/\r?\n/)
  .filter(Boolean)

const forbidden = entries.filter(entry => {
  const normalized = entry.replaceAll('\\', '/')
  if (/\.(?:ts|cts|map)$/i.test(normalized)) return true
  if (/(?:^|\/)(?:tests?|docs)(?:\/|$)/i.test(normalized)) return true
  const runtimeScriptPath = normalized === '/dist-electron/electron/automation/scripts'
    || normalized.includes('/dist-electron/electron/automation/scripts/')
  if (/(?:^|\/)scripts(?:\/|$)/i.test(normalized) && !runtimeScriptPath) return true
  return /(?:admin_)?token\.txt$/i.test(normalized)
})

if (forbidden.length) {
  throw new Error(`Forbidden package entries:\n${forbidden.slice(0, 30).join('\n')}`)
}

console.log(`package_entries=${entries.length}`)
console.log('package_forbidden_entries=0')
