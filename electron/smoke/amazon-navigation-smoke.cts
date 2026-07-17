const { app, BrowserWindow } = require('electron')
const { EmbeddedBrowserHost } = require('../automation/embedded-browser-host.cjs')

const targetUrl = process.env.TOOLBOX_AMAZON_SMOKE_URL || 'https://sellercentral.amazon.com/'
const timeout = setTimeout(() => {
  console.error('amazon navigation smoke test timed out')
  app.exit(2)
}, 60_000)

async function finish(exitCode: number, window?: import('electron').BrowserWindow): Promise<void> {
  clearTimeout(timeout)
  if (window && !window.isDestroyed()) window.destroy()
  app.exit(exitCode)
}

app.whenReady().then(async () => {
  const host = new EmbeddedBrowserHost()
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      webviewTag: true,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  window.webContents.once('did-attach-webview', async (_event: import('electron').Event, guest: import('electron').WebContents) => {
    try {
      host.register(guest)
      const result = await host.request('browser.navigate', { url: targetUrl }) as { url?: string }
      const finalUrl = result.url || guest.getURL()
      const title = await guest.executeJavaScript('document.title', true) as string
      console.log(JSON.stringify({
        amazonNavigation: true,
        hostname: new URL(finalUrl).hostname,
        title,
      }))
      host.release()
      await finish(0, window)
    } catch (error) {
      console.error(error)
      host.release()
      await finish(1, window)
    }
  })

  const html = '<webview src="about:blank" style="width:800px;height:600px" partition="amazon-navigation-smoke"></webview>'
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
})
