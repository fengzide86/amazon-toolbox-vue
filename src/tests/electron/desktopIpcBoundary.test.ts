import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('desktop IPC process boundaries', () => {
  it('validates invoke payloads in preload and again in the main process', () => {
    const preload = readFileSync(resolve('electron/preload.cts'), 'utf8')
    const trustedIpc = readFileSync(resolve('electron/ipc/trusted-ipc.cts'), 'utf8')
    const credentialManager = readFileSync(resolve('electron/core/credential-manager.cts'), 'utf8')

    expect(preload).toContain('parseDesktopIpcArgs(channel, args)')
    expect(trustedIpc).toContain('const parsedArgs = parseDesktopIpcArgs(channel, args)')
    expect(credentialManager).toContain("parseDesktopIpcArgs('credential-save-user-code', args)")
    expect(credentialManager).toContain("parseDesktopIpcArgs('credential-load-user-code', args)")
    expect(credentialManager).toContain("parseDesktopIpcArgs('credential-clear-user-code', args)")
  })

  it('validates automation, batch and notification events before crossing processes', () => {
    const preload = readFileSync(resolve('electron/preload.cts'), 'utf8')
    const automation = readFileSync(resolve('electron/automation/desktop-automation-controller.cts'), 'utf8')
    const batch = readFileSync(resolve('electron/automation/desktop-batch-controller.cts'), 'utf8')
    const notifications = readFileSync(resolve('electron/core/notification-manager.cts'), 'utf8')

    expect(preload).toContain('callback(parseDesktopIpcEvent(channel, data))')
    expect(automation).toContain("parseDesktopIpcEvent('automation:event', rawEvent)")
    expect(batch).toContain("parseDesktopIpcEvent('batch:event', event)")
    expect(notifications).toContain("parseDesktopIpcEvent('toolbox:notification-focus', input.focus)")
  })

  it('keeps the existing channels and exposes typed bridge results', () => {
    const preload = readFileSync(resolve('electron/preload.cts'), 'utf8')
    const bridge = readFileSync(resolve('src/shared/ipc/electron-api.ts'), 'utf8')
    const channels = [
      'credential-save-user-code',
      'demo-activity:set-active',
      'automation:start',
      'automation:event',
      'batch:create',
      'batch:event',
      'freight:quote',
      'open-external',
      'toolbox:notification-focus',
    ]

    for (const channel of channels) expect(preload).toContain(channel)
    expect(bridge).not.toContain('Promise<unknown>')
    expect(bridge).not.toContain('(event: unknown)')
  })
})
