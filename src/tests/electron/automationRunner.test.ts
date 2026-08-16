import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('packaged local automation runtime', () => {
  it('packages the Runner while the server catalog controls demo/live availability', () => {
    const metadata = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      toolbox?: { distribution?: string; automationRuntime?: boolean }
      build?: { extraResources?: unknown[]; files?: string[] }
    }

    expect(metadata.toolbox?.distribution).toBe('internal')
    expect(metadata.toolbox?.automationRuntime).toBe(true)
    expect(metadata.build?.extraResources).toEqual([
      { from: 'resources/templates', to: 'templates', filter: ['**/*.xlsx'] },
      { from: 'resources/rates', to: 'rates', filter: ['**/*.xlsx'] },
      { from: 'build/icon.ico', to: 'icon.ico' },
    ])
    expect(metadata.build?.files).not.toContain('!dist-electron/electron/automation-runner.cjs')
    expect(metadata.build?.files).not.toContain('!dist-electron/electron/automation/scripts/**')
  })

  it('keeps Runner, batch and webview capabilities behind an explicit package/runtime gate', () => {
    const main = readFileSync(resolve('electron/desktop-application.cts'), 'utf8')
    const trustedIpc = readFileSync(resolve('electron/ipc/trusted-ipc.cts'), 'utf8')
    const mainWindow = readFileSync(resolve('electron/core/main-window.cts'), 'utf8')

    expect(main).toContain('packageMetadata.toolbox?.automationRuntime === true')
    expect(main).toContain("process.env.TOOLBOX_AUTOMATION_ENABLED === 'true'")
    expect(main).toContain('automationEnabled: AUTOMATION_RUNTIME_ENABLED')
    expect(trustedIpc).toContain('if (options.automationEnabled) handle(channel, handler)')
    expect(mainWindow).toContain('webviewTag: options.automationEnabled')
  })

  it('only exposes the automation bridge when main explicitly enables it', () => {
    const preload = readFileSync(resolve('electron/preload.cts'), 'utf8')
    const conditionalBridge = preload.indexOf('...(automationEnabled ?')
    const automationBridge = preload.indexOf('automation: {')
    const conditionalBridgeEnd = preload.indexOf('} : {}),', automationBridge)

    expect(conditionalBridge).toBeGreaterThan(-1)
    expect(automationBridge).toBeGreaterThan(conditionalBridge)
    expect(conditionalBridgeEnd).toBeGreaterThan(automationBridge)
  })
})
