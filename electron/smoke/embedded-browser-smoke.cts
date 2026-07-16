// @ts-nocheck Runtime-only Electron smoke harness.
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EmbeddedBrowserHost } = require('../automation/embedded-browser-host.cjs');
const { RunnerClient } = require('../automation/runner-client.cjs');

let runner;
let grantServer;
const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbox-embedded-smoke-'));
const timeout = setTimeout(() => {
  console.error('embedded browser smoke test timed out');
  runner?.stop().finally(() => app.exit(2));
}, 30000);

function startGrantServer() {
  return new Promise(resolve => {
    grantServer = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        success: true,
        data: { valid: true, tool_id: 'embedded-smoke', script_key: 'amazon.register.v1' },
      }));
    });
    grantServer.listen(0, '127.0.0.1', () => resolve(grantServer.address().port));
  });
}

async function cleanup(exitCode) {
  clearTimeout(timeout);
  try { await runner?.stop(); } catch {}
  await new Promise(resolve => grantServer?.close(resolve) || resolve());
  fs.rmSync(artifactRoot, { recursive: true, force: true });
  app.exit(exitCode);
}

app.whenReady().then(async () => {
  const grantPort = await startGrantServer();
  const host = new EmbeddedBrowserHost();
  const window = new BrowserWindow({
    show: false,
    webPreferences: { webviewTag: true, contextIsolation: true, nodeIntegration: false },
  });

  window.webContents.once('did-attach-webview', async (_event, guest) => {
    try {
      host.register(guest);
      const completed = new Promise((resolve, reject) => {
        runner = new RunnerClient({
          scriptPath: path.resolve(__dirname, '../automation-runner.cjs'),
          env: {
            TOOLBOX_CONTROL_API_URL: `http://127.0.0.1:${grantPort}`,
            TOOLBOX_ARTIFACT_ROOT: artifactRoot,
          },
          onHostRequest: (action, payload) => host.request(action, payload),
          onEvent: event => {
            if (event.type === 'run.completed') resolve(event);
            if (event.type === 'run.failed') reject(Object.assign(new Error(event.error.message), event.error));
          },
        });
      });

      await runner.start({
        id: 'embedded-smoke',
        name: '嵌入浏览器巡检',
        platformKey: 'amazon',
        browserMode: 'embedded-cdp',
        targetUrl: 'https://example.com/',
        launchGrant: {
          token: 'smoke-grant',
          scriptKey: 'amazon.register.v1',
          runnerApiVersion: 1,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      });
      const event = await completed;
      console.log(JSON.stringify({
        embeddedBrowser: true,
        runner: event.result.runner,
        script: event.result.scriptName,
        title: event.result.pageTitle,
        screenshotCreated: fs.existsSync(event.result.screenshot),
      }));
      host.release();
      window.destroy();
      await cleanup(0);
    } catch (error) {
      console.error(error);
      await cleanup(1);
    }
  });

  const html = '<webview src="about:blank" style="width:800px;height:600px" partition="smoke"></webview>';
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
});
