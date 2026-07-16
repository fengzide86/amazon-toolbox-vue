// @ts-nocheck Legacy Playwright boundary; all process messages are runtime validated.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright-core');
const {
  EVENTS,
  PROTOCOL_VERSION,
  createSteps,
  findBrowserExecutables,
  publicTool,
  safeProfileName,
} = require('./automation/runtime.cjs');
const { resolveScript } = require('./automation/scripts/registry.cjs');
const { verifyToolManifest } = require('./automation/manifest-verifier.cjs');

const PROFILE_ROOT = process.env.TOOLBOX_PROFILE_ROOT || path.join(process.cwd(), '.automation-profiles');
const ARTIFACT_ROOT = process.env.TOOLBOX_ARTIFACT_ROOT || path.join(process.cwd(), '.automation-artifacts');
const CONTROL_API_BASE = (process.env.TOOLBOX_CONTROL_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const MOCK_MODE = process.env.TOOLBOX_RUNNER_MOCK === 'true';

class AutomationRuntime {
  constructor() {
    this.runId = null;
    this.tool = null;
    this.steps = [];
    this.status = 'idle';
    this.context = null;
    this.page = null;
    this.cancelRequested = false;
    this.pauseWaiters = [];
    this.userActionWaiters = [];
    this.eventSequence = 0;
    this.execution = null;
    this.hostSequence = 0;
    this.hostPending = new Map();
  }

  emit(type, payload = {}) {
    this.eventSequence += 1;
    process.send?.({
      type: 'event',
      event: {
        protocolVersion: PROTOCOL_VERSION,
        eventId: `runner_evt_${Date.now()}_${this.eventSequence}`,
        type,
        timestamp: Date.now(),
        runId: this.runId,
        ...payload,
      },
    });
  }

  async start(tool = {}) {
    if (this.execution) {
      const previousExecution = this.execution;
      if (!['completed', 'failed', 'cancelled'].includes(this.status)) await this.cancel(false);
      try { await previousExecution; } catch {}
    }
    await this.closeBrowser();

    this.runId = `local_run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    this.tool = { ...tool };
    this.steps = createSteps(tool);
    this.status = 'running';
    this.cancelRequested = false;
    this.userActionWaiters = [];
    this.eventSequence = 0;

    this.emit(EVENTS.RUN_STARTED, {
      tool: publicTool(tool),
      steps: this.steps,
      startedAt: Date.now(),
      runner: { kind: 'node-playwright', protocolVersion: PROTOCOL_VERSION },
    });

    const execution = this.execute();
    this.execution = execution;
    execution.finally(() => {
      if (this.execution === execution) this.execution = null;
    });
    return { runId: this.runId };
  }

  async execute() {
    const runId = this.runId;
    const script = resolveScript(this.tool.launchGrant?.scriptKey);
    const embedded = this.tool.browserMode === 'embedded-cdp';
    const result = {
      runner: embedded ? 'node-embedded-cdp' : 'node-playwright',
      scriptKey: script.key,
      scriptName: script.name,
      scriptMode: script.mode,
    };
    try {
      await this.runStep('prepare', async () => {
        const verification = await this.verifyGrant();
        result.signatureVerified = verification.signatureVerified;
        if (MOCK_MODE) {
          result.browser = 'mock';
          await this.sleep(20);
          return;
        }
        if (embedded) {
          const browser = await this.hostRequest('browser.prepare');
          result.browser = browser.mode;
          result.webContentsId = browser.webContentsId;
          return;
        }
        const executablePaths = findBrowserExecutables();
        if (!executablePaths.length) {
          throw this.runnerError('BROWSER_NOT_FOUND', '未找到 Chrome 或 Edge，请先安装其中一个浏览器');
        }
        fs.mkdirSync(PROFILE_ROOT, { recursive: true });
        const profilePath = path.join(PROFILE_ROOT, safeProfileName(this.tool));
        let executablePath;
        let launchError;
        for (const candidate of executablePaths) {
          try {
            this.context = await chromium.launchPersistentContext(profilePath, {
              executablePath: candidate,
              headless: false,
              viewport: null,
              acceptDownloads: true,
              args: ['--start-maximized'],
            });
            executablePath = candidate;
            break;
          } catch (error) {
            launchError = error;
          }
        }
        if (!this.context) {
          throw this.runnerError('BROWSER_LAUNCH_FAILED', `Chrome/Edge 启动失败：${launchError?.message || '未知错误'}`);
        }
        this.page = this.context.pages()[0] || await this.context.newPage();
        result.browser = path.basename(executablePath);
        result.profile = safeProfileName(this.tool);
      });

      await this.runStep('open', async () => {
        const targetUrl = this.validTargetUrl();
        if (embedded) {
          const navigation = await this.hostRequest('browser.navigate', { url: targetUrl }, 50000);
          result.finalUrl = navigation.url;
        } else if (!MOCK_MODE) {
          await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        } else {
          await this.sleep(20);
        }
        this.emit(EVENTS.BROWSER_NAVIGATED, { url: targetUrl });
      });

      await this.runStep('inspect', async () => {
        if (embedded) {
          const inspection = await this.hostRequest('browser.inspect');
          result.pageTitle = inspection.title;
          result.finalUrl = inspection.url;
          result.pageAnalysis = inspection;
        } else {
          result.pageTitle = MOCK_MODE ? 'Runner Mock Page' : await this.page.title();
          result.finalUrl = MOCK_MODE ? this.tool.targetUrl : this.page.url();
        }
        await this.sleep(MOCK_MODE ? 20 : 300);
      });

      await this.runStep('execute', async () => {
        if (embedded) {
          result.highlight = await this.hostRequest('browser.highlight');
          await this.hostRequest('browser.wait', { ms: 1900 });
        } else if (!MOCK_MODE) {
          result.pageAnalysis = await this.page.evaluate(() => ({
            title: document.title,
            url: location.href,
            forms: document.forms.length,
            inputs: document.querySelectorAll('input, textarea, select').length,
            buttons: document.querySelectorAll('button, [role="button"], input[type="submit"]').length,
            links: document.links.length,
          }));
          await this.page.locator('form, main, [role="main"], input, button').first().evaluate(node => {
            const oldOutline = node.style.outline;
            node.style.outline = '3px solid #4f46e5';
            node.style.outlineOffset = '4px';
            setTimeout(() => { node.style.outline = oldOutline; }, 1800);
          }).catch(() => {});
          await this.sleep(1900);
        } else {
          await this.sleep(20);
        }
      });

      await this.runStep('verify', async () => {
        if (MOCK_MODE) {
          await this.sleep(20);
          return;
        }
        fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
        const artifactPath = path.join(ARTIFACT_ROOT, `${runId}.png`);
        if (embedded) {
          const screenshot = await this.hostRequest('browser.screenshot');
          fs.writeFileSync(artifactPath, Buffer.from(screenshot.base64, 'base64'));
        } else {
          await this.page.screenshot({ path: artifactPath, fullPage: false });
        }
        result.screenshot = artifactPath;
        this.emit(EVENTS.ARTIFACT_CREATED, {
          artifact: { type: 'screenshot', path: artifactPath, name: '运行结果截图' },
        });
      });

      await this.runStep('summary', async () => {
        await this.sleep(MOCK_MODE ? 20 : 200);
      });

      this.ensureActive();
      this.status = 'completed';
      this.emit(EVENTS.RUN_COMPLETED, {
        result: { ...result, summary: '本地 Runner 演示任务已完成', completedSteps: this.steps.length },
      });
    } catch (error) {
      if (this.cancelRequested || error?.code === 'RUN_CANCELLED') return;
      this.status = 'failed';
      this.emit(EVENTS.RUN_FAILED, {
        stepId: error.stepId,
        error: { code: error.code || 'RUNNER_ERROR', message: error.message || '本地任务执行失败' },
      });
    }
  }

  async runStep(stepId, operation) {
    await this.waitWhilePaused();
    this.ensureActive();
    const step = this.steps.find(item => item.id === stepId);
    this.emit(EVENTS.STEP_STARTED, { step });
    try {
      await operation();
    } catch (error) {
      error.stepId = stepId;
      throw error;
    }
    this.ensureActive();
    this.emit(EVENTS.STEP_COMPLETED, { stepId });
  }

  async verifyGrant() {
    const signature = verifyToolManifest(this.tool, process.env.TOOLBOX_TOOL_SIGNING_PUBLIC_KEY_B64 || '');
    if (MOCK_MODE) return { signatureVerified: signature.verified };
    const grant = this.tool.launchGrant || {};
    if (!grant.token) throw this.runnerError('GRANT_MISSING', '缺少工具启动授权，请重新打开工具');
    if (grant.runnerApiVersion && grant.runnerApiVersion !== PROTOCOL_VERSION) {
      throw this.runnerError('RUNNER_VERSION_MISMATCH', '工具与本地 Runner 协议版本不兼容');
    }
    if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) {
      throw this.runnerError('GRANT_EXPIRED', '工具启动授权已过期，请重新打开工具');
    }

    const encodedToken = encodeURIComponent(grant.token);
    const endpoints = ['/api/tools/launch-grant/verify', '/api/tools/launch-token/verify'];
    let lastError;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${CONTROL_API_BASE}${endpoint}?token=${encodedToken}`, { method: 'POST' });
        const body = await response.json();
        if (response.status === 404 && endpoint.includes('launch-grant')) continue;
        if (!response.ok || !body?.success || !body?.data?.valid) {
          throw this.runnerError('GRANT_REJECTED', body?.message || body?.detail || '启动授权验证失败');
        }
        if (body.data.tool_id !== this.tool.id) {
          throw this.runnerError('GRANT_TOOL_MISMATCH', '启动授权与当前工具不匹配');
        }
        const execution = this.tool.executionContext;
        if (execution?.mode === 'batch' && (
          body.data.execution_mode !== 'batch'
          || body.data.client_batch_id !== execution.batchId
          || body.data.client_item_id !== execution.itemId
        )) {
          throw this.runnerError('GRANT_BATCH_MISMATCH', '启动授权与当前批次账号不匹配');
        }
        return { ...body.data, signatureVerified: signature.verified };
      } catch (error) {
        lastError = error;
        if (error?.code?.startsWith('GRANT_')) throw error;
      }
    }
    throw this.runnerError('GRANT_VERIFY_UNAVAILABLE', lastError?.message || '无法连接控制服务验证启动授权');
  }

  validTargetUrl() {
    try {
      const url = new URL(this.tool.targetUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      return url.toString();
    } catch {
      throw this.runnerError('TARGET_URL_INVALID', '工具目标网址无效');
    }
  }

  pause() {
    if (this.status !== 'running') return { status: this.status };
    this.status = 'paused';
    this.emit(EVENTS.RUN_PAUSED);
    return { status: this.status };
  }

  resume() {
    if (this.status !== 'paused') return { status: this.status };
    this.status = 'running';
    this.pauseWaiters.splice(0).forEach(resolve => resolve());
    this.emit(EVENTS.RUN_RESUMED);
    return { status: this.status };
  }

  requestUserAction(action = {}) {
    this.status = 'waiting_user';
    this.emit(EVENTS.USER_ACTION_REQUIRED, { action });
    return new Promise(resolve => this.userActionWaiters.push(resolve));
  }

  completeUserAction() {
    if (this.status !== 'waiting_user') return { status: this.status };
    this.status = 'running';
    this.userActionWaiters.splice(0).forEach(resolve => resolve());
    this.emit(EVENTS.USER_ACTION_COMPLETED);
    return { status: this.status };
  }

  async cancel(emitEvent = true) {
    if (['idle', 'completed', 'failed', 'cancelled'].includes(this.status)) {
      await this.closeBrowser();
      return { status: this.status };
    }
    this.cancelRequested = true;
    this.status = 'cancelled';
    this.pauseWaiters.splice(0).forEach(resolve => resolve());
    this.userActionWaiters.splice(0).forEach(resolve => resolve());
    await this.closeBrowser();
    if (emitEvent) this.emit(EVENTS.RUN_CANCELLED);
    return { status: this.status };
  }

  waitWhilePaused() {
    if (this.status !== 'paused') return Promise.resolve();
    return new Promise(resolve => this.pauseWaiters.push(resolve));
  }

  ensureActive() {
    if (this.cancelRequested || this.status === 'cancelled') {
      throw this.runnerError('RUN_CANCELLED', '任务已取消');
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async closeBrowser() {
    if (this.tool?.browserMode === 'embedded-cdp' && !MOCK_MODE) {
      try { await this.hostRequest('browser.detach'); } catch {}
    }
    const context = this.context;
    this.context = null;
    this.page = null;
    if (context) {
      try { await context.close(); } catch {}
    }
  }

  runnerError(code, message) {
    return Object.assign(new Error(message), { code });
  }

  hostRequest(action, payload = {}, timeoutMs = 15000) {
    this.hostSequence += 1;
    const id = `host_${Date.now()}_${this.hostSequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.hostPending.delete(id);
        reject(this.runnerError('BROWSER_HOST_TIMEOUT', `浏览器动作超时: ${action}`));
      }, timeoutMs);
      this.hostPending.set(id, { resolve, reject, timer });
      process.send?.({ type: 'host-request', id, action, payload });
    });
  }

  handleHostResponse(message) {
    const pending = this.hostPending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.hostPending.delete(message.id);
    if (message.ok) pending.resolve(message.data);
    else pending.reject(this.runnerError(message.error?.code || 'BROWSER_HOST_ERROR', message.error?.message || '浏览器动作失败'));
  }

  async shutdown() {
    await this.cancel(false);
    return { stopped: true };
  }
}

const runtime = new AutomationRuntime();

process.on('message', async message => {
  if (message?.type === 'host-response') {
    runtime.handleHostResponse(message);
    return;
  }
  if (message?.type !== 'command') return;
  const { id, command, payload = {} } = message;
  try {
    let data;
    if (command === 'start') data = await runtime.start(payload.tool);
    else if (command === 'pause') data = runtime.pause();
    else if (command === 'resume') data = runtime.resume();
    else if (command === 'complete-user-action') data = runtime.completeUserAction();
    else if (command === 'cancel') data = await runtime.cancel();
    else if (command === 'shutdown') data = await runtime.shutdown();
    else throw Object.assign(new Error(`Unknown runner command: ${command}`), { code: 'UNKNOWN_COMMAND' });
    process.send?.({ type: 'response', id, ok: true, data });
    if (command === 'shutdown') process.exit(0);
  } catch (error) {
    process.send?.({
      type: 'response',
      id,
      ok: false,
      error: { code: error.code || 'RUNNER_COMMAND_FAILED', message: error.message },
    });
  }
});

process.on('disconnect', () => runtime.shutdown().finally(() => process.exit(0)));
process.on('SIGTERM', () => runtime.shutdown().finally(() => process.exit(0)));
