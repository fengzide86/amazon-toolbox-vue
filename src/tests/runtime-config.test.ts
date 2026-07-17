import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { resolveRuntimeConfig } = require('../../dist-electron/electron/core/runtime-config.cjs')

describe('desktop runtime configuration', () => {
  it('uses the packaged HTTPS control plane by default', () => {
    expect(resolveRuntimeConfig({}, {
      toolbox: { controlApiUrl: 'https://8.130.113.104/' },
    })).toEqual({
      controlApiBase: 'https://8.130.113.104',
      useBundledBackend: false,
    })
  })

  it('allows localhost for an explicitly bundled backend', () => {
    expect(resolveRuntimeConfig({
      TOOLBOX_CONTROL_API_URL: 'http://localhost:8000',
      TOOLBOX_USE_BUNDLED_BACKEND: 'true',
    }, {})).toEqual({
      controlApiBase: 'http://localhost:8000',
      useBundledBackend: true,
    })
  })

  it('rejects an insecure remote control plane', () => {
    expect(() => resolveRuntimeConfig({
      TOOLBOX_CONTROL_API_URL: 'http://example.com:8000',
    }, {})).toThrow('Remote control API must use HTTPS')
  })
})
