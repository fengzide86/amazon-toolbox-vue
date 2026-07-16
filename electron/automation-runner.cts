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

type UnknownRecord = Record<string, unknown>;

interface RunnerLaunchGrant extends UnknownRecord {
  token?: string;
  scriptKey?: string;
  runnerApiVersion?: number;
  expiresAt?: string;
}

interface RunnerTool extends UnknownRecord {
  id?: string | number;
  name?: string;
  targetUrl?: string;
  browserMode?: string;
  launchGrant?: RunnerLaunchGrant;
  executionContext?: { mode?: string; batchId?: string; itemId?: string };
}

interface RunnerStep extends UnknownRecord { id: string }
interface PendingHostRequest {
  resolve: (value: UnknownRecord) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface RunnerFailure extends Error { code?: string; stepId?: string }

function asRecord(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : {};
}

function failure(error: unknown, fallback = '未知错误'): RunnerFailure {
  return error instanceof Error ? error as RunnerFailure : new Error(fallback) as RunnerFailure;
}

class AutomationRuntime {
  runId: string | null;
  tool: RunnerTool;
  steps: RunnerStep[];
  status: string;
  context: import('playwright-core').BrowserContext | null;
  page: import('playwright-core').Page | null;
  cancelRequested: boolean;
  pauseWaiters: Array<() => void>;
  userActionWaiters: Array<() => void>;
  eventSequence: number;
  execution: Promise<void> | null;
  hostSequence: number;
  hostPending: Map<string, PendingHostRequest>;

  constructor() {
    this.runId = null;
    this.tool = {};
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
    this.hostPending = new Map<string, PendingHostRequest>();
  }

  emit(type: string, payload: UnknownRecord = {}): void {
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

  async start(tool: RunnerTool = {}) {
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

  async execute(): Promise<void> {
    const runId = this.runId;
    const script = resolveScript(this.tool.launchGrant?.scriptKey);
    const embedded = this.tool.browserMode === 'embedded-cdp';
    const result: UnknownRecord = {
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
        let executablePath: string | undefined;
        let launchError: unknown;
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
          throw this.runnerError('BROWSER_LAUNCH_FAILED', `Chrome/Edge 启动失败：${failure(launchError).message}`);
        }
        this.page = this.context.pages()[0] || await this.context.newPage();
        result.browser = path.basename(executablePath || 'browser');
        result.profile = safeProfileName(this.tool);
      });

      await this.runStep('open', async () => {
        const targetUrl = this.validTargetUrl();
        if (embedded) {
          const navigation = await this.hostRequest('browser.navigate', { url: targetUrl }, 50000);
          result.finalUrl = navigation.url;
        } else if (!MOCK_MODE) {
          await this.requirePage().goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
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
          result.pageTitle = MOCK_MODE ? 'Runner Mock Page' : await this.requirePage().title();
          result.finalUrl = MOCK_MODE ? this.tool.targetUrl : this.requirePage().url();
        }
        await this.sleep(MOCK_MODE ? 20 : 300);
      });

      await this.runStep('execute', async () => {
        if (embedded) {
          result.highlight = await this.hostRequest('browser.highlight');
          await this.hostRequest('browser.wait', { ms: 1900 });
        } else if (!MOCK_MODE) {
          result.pageAnalysis = await this.requirePage().evaluate(() => ({
            title: document.title,
            url: location.href,
            forms: document.forms.length,
            inputs: document.querySelectorAll('input, textarea, select').length,
            buttons: document.querySelectorAll('button, [role="button"], input[type="submit"]').length,
            links: document.links.length,
          }));
          await this.requirePage().locator('form, main, [role="main"], input, button').first().evaluate((node: HTMLElement) => {
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
          if (typeof screenshot.base64 !== 'string') throw this.runnerError('BROWSER_SCREENSHOT_INVALID', '浏览器截图数据无效');
          fs.writeFileSync(artifactPath, Buffer.from(screenshot.base64, 'base64'));
        } else {
          await this.requirePage().screenshot({ path: artifactPath, fullPage: false });
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
      const runError = failure(error, '本地任务执行失败');
      if (this.cancelRequested || runError.code === 'RUN_CANCELLED') return;
      this.status = 'failed';
      this.emit(EVENTS.RUN_FAILED, {
        stepId: runError.stepId,
        error: { code: runError.code || 'RUNNER_ERROR', message: runError.message || '本地任务执行失败' },
      });
    }
  }

  async runStep(stepId: string, operation: () => Promise<void>) {
    await this.waitWhilePaused();
    this.ensureActive();
    const step = this.steps.find(item => item.id === stepId);
    this.emit(EVENTS.STEP_STARTED, { step });
    try {
      await operation();
    } catch (error) {
      const stepError = failure(error);
      stepError.stepId = stepId;
      throw stepError;
    }
    this.ensureActive();
    this.emit(EVENTS.STEP_COMPLETED, { stepId });
  }

  async verifyGrant(): Promise<UnknownRecord> {
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
        const response = await fetch(`${CONTROL_API_BASE}${endpoint}?token=${encodedToken}`, {
          method: 'POST',
          headers: { 'X-Toolbox-Version': process.env.TOOLBOX_CLIENT_VERSION || 'unknown' },
        });
        const body = asRecord(await response.json());
        const data = asRecord(body.data);
        if (response.status === 404 && endpoint.includes('launch-grant')) continue;
        if (!response.ok || body.success !== true || data.valid !== true) {
          const message = typeof body.message === 'string' ? body.message : typeof body.detail === 'string' ? body.detail : '启动授权验证失败';
          throw this.runnerError('GRANT_REJECTED', message);
        }
        if (data.tool_id !== this.tool.id) {
          throw this.runnerError('GRANT_TOOL_MISMATCH', '启动授权与当前工具不匹配');
        }
        const execution = this.tool.executionContext;
        if (execution?.mode === 'batch' && (
          data.execution_mode !== 'batch'
          || data.client_batch_id !== execution.batchId
          || data.client_item_id !== execution.itemId
        )) {
          throw this.runnerError('GRANT_BATCH_MISMATCH', '启动授权与当前批次账号不匹配');
        }
        return { ...data, signatureVerified: signature.verified };
      } catch (error) {
        lastError = error;
        const grantError = failure(error);
        if (grantError.code?.startsWith('GRANT_')) throw grantError;
      }
    }
    throw this.runnerError('GRANT_VERIFY_UNAVAILABLE', failure(lastError, '无法连接控制服务验证启动授权').message);
  }

  validTargetUrl(): string {
    try {
      const url = new URL(this.tool.targetUrl || '');
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

  requestUserAction(action: UnknownRecord = {}): Promise<void> {
    this.status = 'waiting_user';
    this.emit(EVENTS.USER_ACTION_REQUIRED, { action });
    return new Promise<void>((resolve) => this.userActionWaiters.push(resolve));
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

  waitWhilePaused(): Promise<void> {
    if (this.status !== 'paused') return Promise.resolve();
    return new Promise<void>((resolve) => this.pauseWaiters.push(resolve));
  }

  ensureActive(): void {
    if (this.cancelRequested || this.status === 'cancelled') {
      throw this.runnerError('RUN_CANCELLED', '任务已取消');
    }
  }

  sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
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

  requirePage(): import('playwright-core').Page {
    if (!this.page) throw this.runnerError('BROWSER_PAGE_MISSING', '浏览器页面尚未准备好');
    return this.page;
  }

  runnerError(code: string, message: string): RunnerFailure {
    return Object.assign(new Error(message), { code });
  }

  hostRequest(action: string, payload: UnknownRecord = {}, timeoutMs = 15000): Promise<UnknownRecord> {
    this.hostSequence += 1;
    const id = `host_${Date.now()}_${this.hostSequence}`;
    return new Promise<UnknownRecord>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.hostPending.delete(id);
        reject(this.runnerError('BROWSER_HOST_TIMEOUT', `浏览器动作超时: ${action}`));
      }, timeoutMs);
      this.hostPending.set(id, { resolve, reject, timer });
      process.send?.({ type: 'host-request', id, action, payload });
    });
  }

  handleHostResponse(message: UnknownRecord): void {
    if (typeof message.id !== 'string') return;
    const pending = this.hostPending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.hostPending.delete(message.id);
    if (message.ok === true) pending.resolve(asRecord(message.data));
    else {
      const hostError = asRecord(message.error);
      pending.reject(this.runnerError(
        typeof hostError.code === 'string' ? hostError.code : 'BROWSER_HOST_ERROR',
        typeof hostError.message === 'string' ? hostError.message : '浏览器动作失败',
      ));
    }
  }

  async shutdown() {
    await this.cancel(false);
    return { stopped: true };
  }
}

const runtime = new AutomationRuntime();

process.on('message', async (rawMessage: unknown) => {
  const message = asRecord(rawMessage);
  if (message.type === 'host-response') {
    runtime.handleHostResponse(message);
    return;
  }
  if (message?.type !== 'command') return;
  const id = message.id;
  const command = message.command;
  const payload = asRecord(message.payload);
  try {
    let data;
    if (command === 'start') data = await runtime.start(asRecord(payload.tool));
    else if (command === 'pause') data = runtime.pause();
    else if (command === 'resume') data = runtime.resume();
    else if (command === 'complete-user-action') data = runtime.completeUserAction();
    else if (command === 'cancel') data = await runtime.cancel();
    else if (command === 'shutdown') data = await runtime.shutdown();
    else throw Object.assign(new Error(`Unknown runner command: ${command}`), { code: 'UNKNOWN_COMMAND' });
    process.send?.({ type: 'response', id, ok: true, data });
    if (command === 'shutdown') process.exit(0);
  } catch (error) {
    const commandError = failure(error, 'Runner 命令执行失败');
    process.send?.({
      type: 'response',
      id,
      ok: false,
      error: { code: commandError.code || 'RUNNER_COMMAND_FAILED', message: commandError.message },
    });
  }
});

process.on('disconnect', () => runtime.shutdown().finally(() => process.exit(0)));
process.on('SIGTERM', () => runtime.shutdown().finally(() => process.exit(0)));
