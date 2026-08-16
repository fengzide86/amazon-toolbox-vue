import { afterEach, describe, expect, it, vi } from 'vitest'

import { getApiBase } from '@/shared/api/base'
import { installerPathFromManifest, resolveDesktopInstallerUrl } from '@/runtime/desktop-download'
import { resolveRuntimeCapabilities } from '@/runtime/capabilities'
import { compareVersions } from '@/features/updates/web-version'

describe('web runtime capabilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined })
  })

  it('keeps demo and browser file features available while rejecting live runners', () => {
    const capabilities = resolveRuntimeCapabilities(undefined)
    expect(capabilities).toMatchObject({
      kind: 'web',
      singleDemo: true,
      singleLive: false,
      batchDemo: true,
      batchLive: false,
      freightWorkbook: true,
      freightQuote: true,
    })
  })

  it('only enables live capabilities exposed by the desktop bridge', () => {
    const capabilities = resolveRuntimeCapabilities({
      automation: {} as never,
      batch: {} as never,
      freight: {} as never,
    })
    expect(capabilities).toMatchObject({ kind: 'desktop', singleLive: true, batchLive: true, freightWorkbook: true })
  })

  it('uses the browser origin as the formal web API base', () => {
    expect(getApiBase()).toBe(window.location.origin)
  })
})

describe('desktop download discovery', () => {
  it('reads the installer path from electron-updater latest.yml', async () => {
    const manifest = 'version: 1.8.5\npath: KST Setup 1.8.5.exe\nsha512: abc\n'
    expect(installerPathFromManifest(manifest)).toBe('KST Setup 1.8.5.exe')
    const request = vi.fn().mockResolvedValue(new Response(manifest, { status: 200 }))
    await expect(resolveDesktopInstallerUrl(request, 'https://kst.example')).resolves.toBe(
      'https://kst.example/updates/KST%20Setup%201.8.5.exe',
    )
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/updates/latest.yml?t='), { cache: 'no-store' })
  })

  it('rejects unsafe or non-installer manifest paths', () => {
    expect(() => installerPathFromManifest('path: ../setup.exe')).toThrow('无效')
    expect(() => installerPathFromManifest('path: latest.yml')).toThrow('不可用')
  })
})

describe('web version comparison', () => {
  it('compares numeric version segments instead of lexical text', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('v1.8.5', '1.8.5')).toBe(0)
    expect(compareVersions('1.8.4', '1.8.5')).toBeLessThan(0)
  })
})
