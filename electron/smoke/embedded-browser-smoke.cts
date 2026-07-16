const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EmbeddedBrowserHost } = require('../automation/embedded-browser-host.cjs');
const { RunnerClient } = require('../automation/runner-client.cjs');

interface RunnerEvent {
  type: string;
  error?: { message: string; [key: string]: unknown };
  result?: Record<string, unknown>;
}

interface SmokeRunner {
  start(tool: Record<string, unknown>): Promise<unknown>;
  stop(): Promise<unknown>;
}

let runner: SmokeRunner | null = null;
let grantServer: import('http').Server | null = null;
const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbox-embedded-smoke-'));
const timeout = setTimeout(() => {
  console.error('embedded browser smoke test timed out');
  runner?.stop().finally(() => app.exit(2));
}, 30000);

function startGrantServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server: import('http').Server = http.createServer((_request: import('http').IncomingMessage, response: import('http').ServerResponse) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        success: true,
        data: { valid: true, tool_id: 'embedded-smoke', script_key: 'amazon.register.v1' },
      }));
    });
    grantServer = server;
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') reject(new Error('smoke grant server address unavailable'));
      else resolve(address.port);
    });
  });
}

async function cleanup(exitCode: number): Promise<void> {
  clearTimeout(timeout);
  try { await runner?.stop(); } catch {}
  await new Promise<void>((resolve) => grantServer?.close(() => resolve()) || resolve());
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

  window.webContents.once('did-attach-webview', async (_event: import('electron').Event, guest: import('electron').WebContents) => {
    try {
      host.register(guest);
      const completed = new Promise<RunnerEvent>((resolve, reject) => {
        runner = new RunnerClient({
          scriptPath: path.resolve(__dirname, '../automation-runner.cjs'),
          env: {
            TOOLBOX_CONTROL_API_URL: `http://127.0.0.1:${grantPort}`,
            TOOLBOX_ARTIFACT_ROOT: artifactRoot,
          },
          onHostRequest: (action: string, payload: Record<string, unknown>) => host.request(action, payload),
          onEvent: (event: RunnerEvent) => {
            if (event.type === 'run.completed') resolve(event);
            if (event.type === 'run.failed' && event.error) reject(Object.assign(new Error(event.error.message), event.error));
          },
        });
      });

      await runner?.start({
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
      const result = event.result || {};
      console.log(JSON.stringify({
        embeddedBrowser: true,
        runner: result.runner,
        script: result.scriptName,
        title: result.pageTitle,
        screenshotCreated: typeof result.screenshot === 'string' && fs.existsSync(result.screenshot),
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
