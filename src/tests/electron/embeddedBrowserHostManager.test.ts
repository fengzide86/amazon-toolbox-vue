import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { EmbeddedBrowserHostManager } = require('../../../dist-electron/electron/automation/embedded-browser-host-manager.cjs')

function guest(id) {
  return {
    id,
    isDestroyed: () => false,
    once: vi.fn(),
    getURL: () => `https://example.com/${id}`,
    debugger: { isAttached: () => false, attach: vi.fn(), sendCommand: vi.fn(), detach: vi.fn() },
  }
}

describe('EmbeddedBrowserHostManager', () => {
  it('按批次行隔离浏览器宿主，释放一行不会影响另一行', () => {
    const manager = new EmbeddedBrowserHostManager()
    manager.register('item-a', guest(11))
    manager.register('item-b', guest(22))

    expect(manager.isReady('item-a')).toBe(true)
    expect(manager.isReady('item-b')).toBe(true)
    expect(manager.size()).toBe(2)

    manager.release('item-a')
    expect(manager.isReady('item-a')).toBe(false)
    expect(manager.isReady('item-b')).toBe(true)
    expect(manager.size()).toBe(1)
  })
})
