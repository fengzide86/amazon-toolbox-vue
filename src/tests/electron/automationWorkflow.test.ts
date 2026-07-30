import { fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import { get } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const temporaryPaths: string[] = []

afterEach(() => {
  for (const target of temporaryPaths.splice(0)) rmSync(target, { recursive: true, force: true })
})

describe('declarative automation workflow runtime', () => {
  it('registers executable demo and live adapters for the first tool set', () => {
    const { resolveScript } = require(resolve('dist-electron/electron/automation/scripts/registry.cjs')) as {
      resolveScript: (key: string) => Record<string, unknown>
    }
    const capabilities = [
      'listing_script', 'logistics_standard', 'logistics_cost', 'ship_script', 'replenishment', 'fba_agl', 'ad_script',
      'ali_register', 'ali_listing', 'ali_ship',
    ]

    for (const capability of capabilities) {
      const demo = resolveScript(`demo.${capability}_walkthrough_v1`) as {
        sandbox?: boolean
        steps?: Array<{ actions?: Array<{ kind?: string; inputKey?: string }> }>
        allowedHosts?: string[]
        inputSchema?: Array<{ key: string; required?: boolean; type?: string }>
      }
      const live = resolveScript(`amazon.${capability}.v1`) as { sandbox?: boolean; steps?: unknown[]; allowedHosts?: string[] }
      expect(demo.sandbox).toBe(true)
      expect(demo.steps?.length).toBeGreaterThan(0)
      expect(live.sandbox).toBe(false)
      expect(live.steps?.length).toBeGreaterThan(0)
      expect(live.allowedHosts).toContain('idtrade.cn')
      expect(live.allowedHosts?.some(host => host.includes('sellercentral'))).toBe(false)
      const inputTypes = new Map(demo.inputSchema?.map(field => [field.key, field.type]) || [])
      const actions = (demo.steps || []).flatMap(step => step.actions || [])
      for (const action of actions.filter(item => item.kind === 'select')) expect(inputTypes.get(action.inputKey || '')).toBe('select')
      const actionInputKeys = new Set(actions.map(action => action.inputKey).filter((key): key is string => Boolean(key)))
      const missingRequiredInputs = (demo.inputSchema || [])
        .filter(field => field.required !== false && !actionInputKeys.has(field.key))
        .map(field => field.key)
      expect(missingRequiredInputs, `${capability} must write every required input`).toEqual([])
      if (capability === 'replenishment') expect(actions).toContainEqual(expect.objectContaining({ kind: 'calculate', formula: 'replenishment' }))
    }
  })

  it('persists only checkpoint metadata and resumes idempotent actions', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolbox-checkpoint-'))
    temporaryPaths.push(root)
    const { CheckpointStore } = require(resolve('dist-electron/electron/automation/checkpoint-store.cjs')) as {
      CheckpointStore: new (root: string, key: string, scriptKey: string, input: Record<string, unknown>) => {
        filePath: string
        has(id: string): boolean
        mark(id: string): void
      }
    }
    const first = new CheckpointStore(root, 'session-1', 'amazon.listing_script.v1', { sku: 'SKU-1', secret: 'must-not-be-written' })
    first.mark('fill_sku')
    const persisted = readFileSync(first.filePath, 'utf8')
    expect(persisted).toContain('fill_sku')
    expect(persisted).not.toContain('must-not-be-written')
    const second = new CheckpointStore(root, 'session-1', 'amazon.listing_script.v1', { sku: 'SKU-1', secret: 'must-not-be-written' })
    expect(second.has('fill_sku')).toBe(true)
  })

  it('serves a local interactive sandbox with real form controls and success verification', async () => {
    const { resolveScript } = require(resolve('dist-electron/electron/automation/scripts/registry.cjs')) as {
      resolveScript: (key: string) => Record<string, unknown>
    }
    const { startSandboxServer } = require(resolve('dist-electron/electron/automation/sandbox-server.cjs')) as {
      startSandboxServer: (script: Record<string, unknown>) => Promise<{ url: string; close(): Promise<void> }>
    }
    const sandbox = await startSandboxServer(resolveScript('demo.listing_script_walkthrough_v1'))
    try {
      const html = await new Promise<string>((resolveHtml, rejectHtml) => {
        get(sandbox.url, response => {
          let body = ''
          response.setEncoding('utf8')
          response.on('data', chunk => { body += chunk })
          response.on('end', () => resolveHtml(body))
        }).on('error', rejectHtml)
      })
      expect(html).toContain('name="sku"')
      expect(html).toContain('id="submit-task"')
      expect(html).toContain('data-status="idle"')
      expect(html).toContain('操作成功')
      expect(html).toContain('background:#f4f5f7')
      expect(html).toContain('--blue:#2d5fca')
      expect(html).toContain('--gold:#a98552')
      expect(html).toContain('background:var(--ink)')
      expect(html).not.toContain('Precision mineral theme')
      expect(html).not.toContain('--blue:#405f78')
    } finally {
      await sandbox.close()
    }
  })

  it('downloads, validates, caches, and reuses a signed declarative adapter artifact', async () => {
    const root = mkdtempSync(join(tmpdir(), 'toolbox-adapter-cache-'))
    temporaryPaths.push(root)
    const { resolveScript } = require(resolve('dist-electron/electron/automation/scripts/registry.cjs')) as {
      resolveScript: (key: string) => Record<string, unknown>
    }
    const { resolveSignedAdapter } = require(resolve('dist-electron/electron/automation/adapter-loader.cjs')) as {
      resolveSignedAdapter: (
        tool: Record<string, unknown>, embedded: Record<string, unknown>, cacheRoot: string,
        controlApiBase: string, signatureVerified: boolean,
      ) => Promise<{ adapter: Record<string, unknown>; source: string }>
    }
    const adapter = JSON.parse(JSON.stringify(resolveScript('amazon.listing_script.v1'))) as Record<string, unknown>
    adapter.version = '1.1.0'
    const bytes = Buffer.from(JSON.stringify(adapter), 'utf8')
    const digest = createHash('sha256').update(bytes).digest('hex')
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': String(bytes.length) }),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      } as Response)
      .mockRejectedValueOnce(new Error('offline'))
    const controlApiBase = 'http://127.0.0.1:8000'
    const tool = {
      executionMode: 'live',
      launchGrant: { toolManifest: {
        scriptKey: adapter.key,
        version: adapter.version,
        artifactSha256: digest,
        artifactUrl: '/adapter.json',
      } },
    }
    const downloaded = await resolveSignedAdapter(tool, {}, root, controlApiBase, true)
    expect(downloaded.source).toBe('download')
    expect(downloaded.adapter).toEqual(expect.objectContaining({ key: adapter.key, version: '1.1.0', sandbox: false }))

    const cached = await resolveSignedAdapter(tool, {}, root, controlApiBase, true)
    expect(cached.source).toBe('cache')
    expect(cached.adapter).toEqual(expect.objectContaining({ key: adapter.key, version: '1.1.0' }))
  })

  it('runs a complete product-listing workflow through the child-process protocol', async () => {
    const runnerPath = resolve('dist-electron/electron/automation-runner.cjs')
    const child = fork(runnerPath, [], {
      env: { ...process.env, TOOLBOX_RUNNER_MOCK: 'true', TOOLBOX_MIN_ACTION_INTERVAL_MS: '250', ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    const eventTypes: string[] = []
    let result: Record<string, unknown>
    try {
      result = await new Promise<Record<string, unknown>>((resolveRun, rejectRun) => {
        const timer = setTimeout(() => rejectRun(new Error('runner test timed out')), 45_000)
        const rejectAndClear = (error: Error) => {
          clearTimeout(timer)
          rejectRun(error)
        }
        child.once('error', rejectAndClear)
        child.once('exit', (code, signal) => {
          if (code !== null || signal !== null) rejectAndClear(new Error(`runner exited before completion: code=${code}, signal=${signal}`))
        })
        child.on('message', raw => {
          const message = raw as { type?: string; event?: Record<string, unknown> }
          if (message.type !== 'event' || !message.event) return
          eventTypes.push(String(message.event.type || ''))
          if (message.event.type === 'run.completed') {
            clearTimeout(timer)
            resolveRun(message.event)
          }
          if (message.event.type === 'run.failed') {
            clearTimeout(timer)
            rejectRun(new Error(JSON.stringify(message.event.error)))
          }
        })
        child.send({
          type: 'command', id: 'start-1', command: 'start', payload: { tool: {
            id: 'tool_listing_script', name: '自动上品脚本', platformKey: 'amazon', executionMode: 'demo',
            scriptKey: 'demo.listing_script_walkthrough_v1', targetUrl: 'demo://amazon/listing',
            executionContext: { mode: 'single', sessionId: 'test-session', input: {} },
          } },
        })
      })
    } finally {
      if (child.connected) child.send({ type: 'command', id: 'shutdown-1', command: 'shutdown', payload: {} })
      await new Promise<void>(resolveExit => {
        if (child.exitCode !== null || child.signalCode !== null) return resolveExit()
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          clearTimeout(killTimer)
          resolveExit()
        }
        child.once('exit', finish)
        const killTimer = setTimeout(() => {
          child.kill()
          finish()
        }, 2_000)
      })
    }

    expect(eventTypes).toContain('run.started')
    expect(eventTypes).toContain('step.completed')
    expect(eventTypes.at(-1)).toBe('run.completed')
    expect(result.result).toEqual(expect.objectContaining({ recordKind: 'demo' }))
  }, 50_000)
})
