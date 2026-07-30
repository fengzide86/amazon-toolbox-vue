import { fork } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const mock = process.argv.includes('--mock')
const capabilityFlag = process.argv.indexOf('--capability')
const capability = capabilityFlag >= 0 ? process.argv[capabilityFlag + 1] : 'listing_script'
if (!capability || !/^[a-z0-9_]+$/.test(capability)) throw new Error('invalid --capability value')
const root = resolve('.automation-smoke')
mkdirSync(root, { recursive: true })
const child = fork(resolve('dist-electron/electron/automation-runner.cjs'), [], {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    TOOLBOX_RUNNER_MOCK: mock ? 'true' : 'false',
    TOOLBOX_PROFILE_ROOT: resolve(root, 'profiles'),
    TOOLBOX_ARTIFACT_ROOT: resolve(root, 'artifacts'),
    TOOLBOX_FREIGHT_RATE_WORKBOOK: resolve('resources', 'rates', 'FreightTemplate_v2.xlsx'),
    TOOLBOX_MIN_ACTION_INTERVAL_MS: '250',
  },
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
})

let settled = false
const finish = (code, payload) => {
  if (settled) return
  settled = true
  clearTimeout(timeout)
  if (payload) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  child.send?.({ type: 'command', id: 'smoke-shutdown', command: 'shutdown', payload: {} })
  setTimeout(() => { child.kill(); process.exit(code) }, 400)
}
const timeout = setTimeout(() => finish(1, { success: false, error: 'automation smoke timed out' }), 90_000)

child.on('message', message => {
  if (message?.type !== 'event') return
  process.stdout.write(`[automation-smoke] ${message.event?.type || 'event'}\n`)
  if (message.event?.type === 'run.completed') finish(0, { success: true, result: message.event.result })
  if (message.event?.type === 'run.failed') finish(1, { success: false, error: message.event.error })
})
child.on('error', error => finish(1, { success: false, error: error.message }))
child.on('exit', code => { if (!settled) finish(code || 1, { success: false, error: `runner exited with ${code}` }) })

child.send({
  type: 'command',
  id: 'smoke-start',
  command: 'start',
  payload: {
    tool: {
      id: `tool_${capability}`,
      name: `自动化烟测：${capability}`,
      platformKey: 'amazon',
      executionMode: 'demo',
      scriptKey: `demo.${capability}_walkthrough_v1`,
      targetUrl: `demo://amazon/${capability}`,
      executionContext: { mode: 'single', sessionId: `smoke_${Date.now()}`, input: {} },
    },
  },
})
