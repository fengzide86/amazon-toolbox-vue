import { afterEach, describe, expect, it } from 'vitest'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { RunnerClient } = require('../../../electron/automation/runner-client.cjs')
const { createSteps, safeProfileName } = require('../../../electron/automation/runtime.cjs')

describe('Node Automation Runner', () => {
  let client

  afterEach(async () => {
    await client?.stop()
    client = null
  })

  it('使用独立进程按统一协议完成一轮任务', async () => {
    const events = []
    let resolveCompleted
    const completed = new Promise(resolve => { resolveCompleted = resolve })
    client = new RunnerClient({
      scriptPath: path.resolve(process.cwd(), 'electron/automation-runner.cjs'),
      env: { TOOLBOX_RUNNER_MOCK: 'true' },
      onEvent: event => {
        events.push(event)
        if (event.type === 'run.completed') resolveCompleted(event)
      },
      timeoutMs: 5000,
    })

    const response = await client.start({
      id: 'tool_listing',
      name: '自动上品脚本',
      platformKey: 'amazon',
      targetUrl: 'https://sellercentral.amazon.com/',
      launchGrant: { scriptKey: 'amazon.listing.v1', runnerApiVersion: 1 },
    })
    const terminalEvent = await completed

    expect(response.runId).toMatch(/^local_run_/)
    expect(events[0].type).toBe('run.started')
    expect(events.filter(event => event.type === 'step.completed')).toHaveLength(6)
    expect(terminalEvent.result.runner).toBe('node-playwright')
    expect(events[0].tool.launchGrant.token).toBeUndefined()
  }, 10000)

  it('生成固定步骤并隔离平台 Profile 名称', () => {
    expect(createSteps({ platformKey: 'amazon' })).toHaveLength(6)
    expect(safeProfileName({ platformKey: '../amazon seller' })).toBe('___amazon_seller')
  })

  it('注册巡检脚本使用只读步骤文案', () => {
    const steps = createSteps({
      platformKey: 'amazon',
      targetUrl: 'https://sellercentral.amazon.com/',
      launchGrant: { scriptKey: 'amazon.register.v1' },
    })

    expect(steps.find(step => step.id === 'execute')).toMatchObject({
      title: '标记页面关键区域',
      action: '正在识别表单、按钮和主要内容区',
    })
    expect(steps.find(step => step.id === 'verify').title).toBe('生成巡检证据')
  })

  it('把嵌入浏览器动作双向转发给 Electron Browser Host', async () => {
    const actions = []
    let resolveCompleted
    const completed = new Promise(resolve => { resolveCompleted = resolve })
    client = new RunnerClient({
      scriptPath: path.resolve(process.cwd(), 'electron/automation-runner.cjs'),
      env: { TOOLBOX_RUNNER_MOCK: 'true' },
      onHostRequest: async (action, payload) => {
        actions.push(action)
        if (action === 'browser.navigate') return { url: payload.url }
        if (action === 'browser.inspect') return { title: 'Embedded Page', url: 'https://example.com/', forms: 1 }
        if (action === 'browser.highlight') return { matched: true, tagName: 'MAIN' }
        if (action === 'browser.wait') return { waited: payload.ms }
        return {}
      },
      onEvent: event => {
        if (event.type === 'run.completed') resolveCompleted(event)
      },
      timeoutMs: 5000,
    })

    await client.start({
      id: 'tool_register',
      platformKey: 'amazon',
      browserMode: 'embedded-cdp',
      targetUrl: 'https://example.com/',
      launchGrant: { scriptKey: 'amazon.register.v1', runnerApiVersion: 1 },
    })
    const event = await completed

    expect(actions).toEqual(['browser.navigate', 'browser.inspect', 'browser.highlight', 'browser.wait'])
    expect(event.result).toMatchObject({
      runner: 'node-embedded-cdp',
      scriptName: '亚马逊注册页面巡检',
      pageTitle: 'Embedded Page',
    })
  }, 10000)
})
