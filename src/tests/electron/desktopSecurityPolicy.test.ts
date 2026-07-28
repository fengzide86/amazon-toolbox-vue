import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeUpdateErrorCode } from '../../../electron/core/update-errors.js'
import { assertTrustedSender, isTrustedRendererUrl } from '../../../electron/ipc/sender-guard.js'
import {
  isAllowedExternalUrl,
  isAllowedMainFrameUrl,
  isAllowedWebviewPartition,
  isAllowedWebviewUrl,
  isRealCommerceHost,
} from '../../../electron/security/navigation-policy.js'

describe('desktop renderer trust policy', () => {
  it('only accepts the application origin in packaged mode', () => {
    expect(isTrustedRendererUrl('app://toolbox/index.html#/user')).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:3000/user')).toBe(false)
    expect(isTrustedRendererUrl('https://example.com/app')).toBe(false)
  })

  it('allows the exact development origin only when explicitly enabled', () => {
    expect(isAllowedMainFrameUrl('http://localhost:3000/admin', true)).toBe(true)
    expect(isAllowedMainFrameUrl('http://localhost:3001/admin', true)).toBe(false)
    expect(isAllowedMainFrameUrl('http://127.0.0.1:3000/admin', true)).toBe(false)
  })

  it('requires both the active window id and its trusted frame origin', () => {
    const window = { isDestroyed: () => false, webContents: { id: 7 } }
    const trustedEvent = {
      sender: { id: 7, getURL: () => 'app://toolbox/index.html' },
      senderFrame: { url: 'app://toolbox/index.html' },
    }
    expect(() => assertTrustedSender(trustedEvent as never, () => window as never)).not.toThrow()
    expect(() => assertTrustedSender({ ...trustedEvent, sender: { ...trustedEvent.sender, id: 8 } } as never, () => window as never)).toThrow()
    expect(() => assertTrustedSender({ ...trustedEvent, senderFrame: { url: 'https://example.com/' } } as never, () => window as never)).toThrow()
  })

  it('keeps webviews on credential-free HTTPS and known partitions', () => {
    expect(isAllowedWebviewUrl('https://sellercentral.amazon.com/home')).toBe(true)
    expect(isAllowedWebviewUrl('http://sellercentral.amazon.com/home')).toBe(false)
    expect(isAllowedWebviewUrl('http://127.0.0.1:49152/automation-sandbox')).toBe(true)
    expect(isAllowedWebviewUrl('http://localhost:49152/automation-sandbox')).toBe(true)
    expect(isAllowedWebviewUrl('https://user:pass@example.com/')).toBe(false)
    expect(isAllowedWebviewPartition('persist:tool-workspace')).toBe(true)
    expect(isAllowedWebviewPartition('batch-demo_account-1')).toBe(true)
    expect(isAllowedWebviewPartition('persist:untrusted')).toBe(false)
  })

  it('only delegates normal HTTP(S) links to the system browser', () => {
    expect(isAllowedExternalUrl('https://example.com/help')).toBe(true)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('https://user:pass@example.com/')).toBe(false)
    expect(isAllowedExternalUrl('https://sellercentral.amazon.com/home', true)).toBe(false)
    expect(isAllowedExternalUrl('https://sellercentral.amazon.co.uk/home', true)).toBe(false)
    expect(isAllowedExternalUrl('https://sellercenter.aliexpress.com/home', true)).toBe(false)
    expect(isAllowedExternalUrl('https://example.com/help', true)).toBe(true)
    expect(isRealCommerceHost('tools.sellercentral.amazon.com')).toBe(true)
  })
})

describe('desktop update error contract', () => {
  it('normalizes updater-specific failures to stable error codes', () => {
    expect(normalizeUpdateErrorCode(Object.assign(new Error('更新检查超时'), { code: 'UPDATE_CHECK_TIMEOUT' }), 'CHECK_FAILED')).toBe('CHECK_TIMEOUT')
    expect(normalizeUpdateErrorCode(new Error('sha512 checksum mismatch'), 'DOWNLOAD_FAILED')).toBe('HASH_MISMATCH')
    expect(normalizeUpdateErrorCode(Object.assign(new Error('write failed'), { code: 'ENOSPC' }), 'DOWNLOAD_FAILED')).toBe('DISK_FULL')
    expect(normalizeUpdateErrorCode(Object.assign(new Error('offline'), { code: 'ENOTFOUND' }), 'CHECK_FAILED')).toBe('NETWORK_OFFLINE')
    expect(normalizeUpdateErrorCode(new Error('unexpected'), 'DOWNLOAD_FAILED')).toBe('DOWNLOAD_FAILED')
    expect(normalizeUpdateErrorCode(Object.assign(new Error('cleanup timeout'), { code: 'INSTALL_BUSY' }), 'INSTALL_QUIESCE_FAILED')).toBe('INSTALL_BUSY')
  })

  it('keeps installer launch behind explicit consent and awaited cleanup', () => {
    const source = readFileSync(resolve('electron/core/update-manager.cts'), 'utf8')
    expect(source).toContain('this.updater.autoInstallOnAppQuit = false')
    expect(source).toContain('private installOnQuitApproved = false')
    expect(source).toContain('this.installOnQuitApproved = true')
    expect(source).toContain('return this.installOnQuitApproved')
    expect(source).toContain('await this.prepareForInstall()')
    expect(source.indexOf('await this.prepareForInstall()')).toBeLessThan(source.indexOf('this.updater.quitAndInstall(false, true)'))
    expect(source.indexOf("this.setState({ status: 'installing'")).toBeGreaterThan(source.indexOf('await this.prepareForInstall()'))
    expect(source).toContain("status: errorCode === 'INSTALL_BUSY' ? 'restart_deferred' : 'error'")
  })
})

describe('app protocol renderer entrypoint', () => {
  it('uses external module scripts under a strict script CSP with a static startup fallback', () => {
    const html = readFileSync(resolve('index.html'), 'utf8')
    const csp = html.match(/http-equiv=["']Content-Security-Policy["'][^>]*content=(["'])(.*?)\1/i)?.[2] || ''
    const scriptPolicy = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/i)?.[1] || ''
    expect(scriptPolicy).not.toContain("'unsafe-inline'")
    expect(scriptPolicy).not.toContain("'unsafe-eval'")
    expect(html).not.toMatch(/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i)
    expect(html).toContain('startup-loading')
    expect(readFileSync(resolve('electron/main.cts'), 'utf8')).toContain("window.loadURL('app://toolbox/index.html')")
    expect(readFileSync(resolve('electron/core/app-protocol.cts'), 'utf8')).toContain("scheme: 'app'")
  })
})

describe('internal desktop package profile', () => {
  it('ships the explicitly enabled local runner but never bundles the control backend', () => {
    const metadata = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      toolbox?: { distribution?: string; automationRuntime?: boolean }
      scripts?: Record<string, string>
      build?: { extraResources?: unknown[]; files?: string[] }
    }
    expect(metadata.toolbox?.distribution).toBe('internal')
    expect(metadata.toolbox?.automationRuntime).toBe(true)
    expect(metadata.build?.extraResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'resources/templates', to: 'templates' }),
      expect.objectContaining({ from: 'resources/rates', to: 'rates' }),
    ]))
    expect(metadata.scripts?.['electron:release']).not.toContain('backend:build')
    expect(metadata.build?.files).not.toContain('!dist-electron/electron/automation-runner.cjs')
    expect(metadata.build?.files).not.toContain('!dist-electron/electron/automation/scripts/**')
  })

  it('removes tool-launch IPC from the internal renderer bridge', () => {
    const main = readFileSync(resolve('electron/main.cts'), 'utf8')
    const preload = readFileSync(resolve('electron/preload.cts'), 'utf8')
    expect(main).toContain("if (AUTOMATION_RUNTIME_ENABLED) registerTrustedOn('launch-tool'")
    expect(preload.indexOf('launchTool:')).toBeGreaterThan(preload.indexOf('...(automationEnabled'))
    expect(preload.indexOf('launchTool:')).toBeLessThan(preload.indexOf('} : {}),'))
    expect(preload).toContain("'demo-activity:set-active'")
  })

  it('preflights deployment disk space before service stop or migration', () => {
    const deploy = readFileSync(resolve('ops/deploy/deploy-backend.sh'), 'utf8')
    const firstSpaceCheck = deploy.indexOf('require_free_space "backup and archive extraction"')
    const deploymentStop = deploy.indexOf('DEPLOY_STARTED=1')
    expect(firstSpaceCheck).toBeGreaterThan(0)
    expect(firstSpaceCheck).toBeLessThan(deploymentStop)
    expect(firstSpaceCheck).toBeLessThan(deploy.indexOf('-m alembic upgrade head'))
    expect(deploy).toContain('ops/systemd/toolbox-backend.service')
    expect(readFileSync(resolve('ops/systemd/toolbox-backend.service'), 'utf8')).toContain('--workers 1')
  })
})
