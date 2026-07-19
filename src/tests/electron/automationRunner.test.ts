import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('internal demo-only automation profile', () => {
  it('does not package the Runner or its real automation scripts', () => {
    const metadata = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      toolbox?: { distribution?: string }
      build?: { extraResources?: unknown[]; files?: string[] }
    }

    expect(metadata.toolbox?.distribution).toBe('internal')
    expect(metadata.build?.extraResources).toEqual([])
    expect(metadata.build?.files).toContain('!dist-electron/electron/automation-runner.cjs')
    expect(metadata.build?.files).toContain('!dist-electron/electron/automation/scripts/**')
  })

  it('keeps Runner, batch and webview capabilities behind the development profile gate', () => {
    const main = readFileSync(resolve('electron/main.cts'), 'utf8')

    expect(main).toContain("packageMetadata.toolbox?.distribution === 'internal'")
    expect(main).toContain('const AUTOMATION_RUNTIME_ENABLED = !INTERNAL_PRODUCTION')
    expect(main).toContain('if (AUTOMATION_RUNTIME_ENABLED) registerTrustedHandle(channel, handler)')
    expect(main).toContain('webviewTag: AUTOMATION_RUNTIME_ENABLED')
  })

  it('does not expose the automation bridge in an internal packaged renderer', () => {
    const preload = readFileSync(resolve('electron/preload.cts'), 'utf8')
    const conditionalBridge = preload.indexOf('...(automationEnabled ?')
    const automationBridge = preload.indexOf('automation: {')
    const conditionalBridgeEnd = preload.indexOf('} : {}),', automationBridge)

    expect(conditionalBridge).toBeGreaterThan(-1)
    expect(automationBridge).toBeGreaterThan(conditionalBridge)
    expect(conditionalBridgeEnd).toBeGreaterThan(automationBridge)
  })
})
