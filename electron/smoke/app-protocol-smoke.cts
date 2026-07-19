import { app, BrowserWindow } from 'electron'
import path from 'node:path'

const { registerAppProtocol, registerAppScheme } = require('../core/app-protocol.cjs')

registerAppScheme()

async function waitForRenderer(window: BrowserWindow): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const state = await window.webContents.executeJavaScript(`(() => ({
      hasAppContent: Boolean(document.querySelector('#app')?.firstElementChild),
      stillShowingFallback: Boolean(document.querySelector('.startup-loading')),
      title: document.title,
    }))()`)
    if (state.hasAppContent && !state.stillShowingFallback) {
      console.log(`app_protocol_url=${window.webContents.getURL()}`)
      console.log(`app_protocol_title=${state.title}`)
      return
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('app://toolbox loaded, but the renderer did not replace the static startup fallback')
}

app.whenReady().then(async () => {
  registerAppProtocol(path.resolve(__dirname, '../../../dist'))
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  try {
    await window.loadURL('app://toolbox/index.html')
    await waitForRenderer(window)
    window.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error)
    window.destroy()
    app.exit(1)
  }
})
