import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { EmbeddedBrowserHost } = require('../../../dist-electron/electron/automation/embedded-browser-host.cjs')

function createGuest(initialUrl = 'https://example.com/') {
  const guest = new EventEmitter() as EventEmitter & Record<string, unknown>
  let url = initialUrl
  let attached = false
  guest.id = 42
  guest.isDestroyed = () => false
  guest.getURL = () => url
  guest.setURL = (nextUrl: string) => { url = nextUrl }
  guest.isLoading = () => false
  guest.loadURL = vi.fn(async nextUrl => {
    url = nextUrl
    queueMicrotask(() => guest.emit('dom-ready'))
  })
  guest.executeJavaScript = vi.fn(async expression => {
    if (expression === 'document.readyState') return 'complete'
    if (expression.includes('__toolbox_runner_overlay__')) return { matched: true, tagName: 'MAIN' }
    return { title: 'Example', url, forms: 1, inputs: 2, buttons: 3, links: 4 }
  })
  guest.capturePage = vi.fn(async () => ({ toPNG: () => Buffer.from('png') }))
  guest.debugger = {
    isAttached: () => attached,
    attach: vi.fn(() => { attached = true }),
    detach: vi.fn(() => { attached = false }),
    sendCommand: vi.fn(async (_command, _payload) => {
      return {}
    }),
  }
  return guest
}

describe('EmbeddedBrowserHost', () => {
  it('通过受限动作控制已注册 webview 并读取页面', async () => {
    const host = new EmbeddedBrowserHost()
    const guest = createGuest()
    host.register(guest)

    await host.request('browser.prepare')
    await host.request('browser.navigate', { url: 'https://example.com/next' })
    const inspection = await host.request('browser.inspect')
    const highlight = await host.request('browser.highlight')
    const screenshot = await host.request('browser.screenshot')

    expect(guest.loadURL).toHaveBeenCalledWith('https://example.com/next')
    expect(inspection).toMatchObject({ title: 'Example', forms: 1, inputs: 2, buttons: 3 })
    expect(highlight).toEqual({ matched: true, tagName: 'MAIN' })
    expect(screenshot.base64).toBe('cG5n')
  })

  it('拒绝非 HTTP 协议和未定义动作', async () => {
    const host = new EmbeddedBrowserHost()
    host.register(createGuest())

    await expect(host.request('browser.navigate', { url: 'file:///etc/passwd' })).rejects.toMatchObject({ code: 'TARGET_URL_INVALID' })
    await expect(host.request('browser.eval', { code: 'alert(1)' })).rejects.toMatchObject({ code: 'BROWSER_ACTION_UNSUPPORTED' })
  })

  it('目标页面已经就绪时不重复导航', async () => {
    const host = new EmbeddedBrowserHost()
    const guest = createGuest('https://sellercentral.amazon.com/home')
    host.register(guest)

    const result = await host.request('browser.navigate', { url: 'https://sellercentral.amazon.com/' })

    expect(guest.loadURL).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      url: 'https://sellercentral.amazon.com/home',
      reused: true,
    })
  })

  it('允许 Amazon 登录链路重定向，并忽略 ERR_ABORTED', async () => {
    const host = new EmbeddedBrowserHost()
    const guest = createGuest('about:blank')
    guest.loadURL = vi.fn(async () => {
      queueMicrotask(() => {
        ;(guest.setURL as (nextUrl: string) => void)('https://signin.amazon.com/ap/signin')
        guest.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'https://sellercentral.amazon.com/', true)
        guest.emit('did-redirect-navigation', {}, 'https://signin.amazon.com/ap/signin', false, true)
        guest.emit('dom-ready')
      })
      throw Object.assign(new Error('ERR_ABORTED'), { errno: -3 })
    })
    host.register(guest)

    await expect(host.request('browser.navigate', {
      url: 'https://sellercentral.amazon.com/',
    })).resolves.toMatchObject({
      url: 'https://signin.amazon.com/ap/signin',
      reused: false,
    })
  })
})
