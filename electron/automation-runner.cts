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
const {
  detectPlaywrightInterruption,
  executePlaywrightAction,
  isTransientActionError,
} = require('./automation/action-engine.cjs');
const { persistPageScan, scanPlaywrightPage } = require('./automation/page-scanner.cjs');
const { CheckpointStore } = require('./automation/checkpoint-store.cjs');
const { startSandboxServer } = require('./automation/sandbox-server.cjs');
const { parseFreightWorkbook } = require('./freight/rate-pack.cjs');
const { quoteFreight } = require('../src/shared/freight/rate-engine.js');
const { resolveSignedAdapter } = require('./automation/adapter-loader.cjs');

const PROFILE_ROOT = process.env.TOOLBOX_PROFILE_ROOT || path.join(process.cwd(), '.automation-profiles');
const ARTIFACT_ROOT = process.env.TOOLBOX_ARTIFACT_ROOT || path.join(process.cwd(), '.automation-artifacts');
const CONTROL_API_BASE = (process.env.TOOLBOX_CONTROL_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const MOCK_MODE = process.env.TOOLBOX_RUNNER_MOCK === 'true';
let defaultFreightPackPromise: Promise<UnknownRecord> | null = null;

async function loadDefaultFreightPack(): Promise<UnknownRecord> {
  if (!defaultFreightPackPromise) {
    const workbookPath = process.env.TOOLBOX_FREIGHT_RATE_WORKBOOK || '';
    defaultFreightPackPromise = parseFreightWorkbook(workbookPath, {
      id: 'competition-freight', version: '1.0.0', exchangeRateCnyPerUsd: 7,
    }).then((parsed: UnknownRecord) => asRecord(parsed.pack) || {});
  }
  return defaultFreightPackPromise!;
}
const MIN_ACTION_INTERVAL_MS = Math.min(Math.max(Number(process.env.TOOLBOX_MIN_ACTION_INTERVAL_MS) || 700, 250), 5000);
const CIRCUIT_BREAKER_THRESHOLD = Math.min(Math.max(Number(process.env.TOOLBOX_CIRCUIT_BREAKER_THRESHOLD) || 3, 2), 8);

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
  platformKey?: string;
  targetUrl?: string;
  browserMode?: string;
  executionMode?: 'demo' | 'live';
  launchGrant?: RunnerLaunchGrant;
  executionContext?: { mode?: string; batchId?: string; itemId?: string; sessionId?: string; input?: UnknownRecord };
}

interface RunnerStep extends UnknownRecord { id: string }
interface WorkflowAction extends UnknownRecord {
  id?: string;
  kind?: string;
  title?: string;
  retries?: number;
  idempotent?: boolean;
  formula?: string;
  outputKey?: string;
}
interface WorkflowStep extends UnknownRecord { id?: string; actions?: WorkflowAction[] }
interface WorkflowScript extends UnknownRecord {
  key?: string;
  name?: string;
  version?: string;
  sandbox?: boolean;
  allowedHosts?: string[];
  defaultInput?: UnknownRecord;
  inputSchema?: Array<{ key?: string; label?: string; required?: boolean }>;
  steps?: WorkflowStep[];
  successChecks?: WorkflowAction[];
  requestedKey?: string | null;
}

interface PendingHostRequest {
  resolve: (value: UnknownRecord) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface RunnerFailure extends Error { code?: string; stepId?: string; actionId?: string }

function asRecord(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : {};
}

function failure(error: unknown, fallback = '未知错误'): RunnerFailure {
  return error instanceof Error ? error as RunnerFailure : new Error(fallback) as RunnerFailure;
}

class AutomationRuntime {
  runId: string | null = null;
  tool: RunnerTool = {};
  script: WorkflowScript = {};
  steps: RunnerStep[] = [];
  status = 'idle';
  context: import('playwright-core').BrowserContext | null = null;
  page: import('playwright-core').Page | null = null;
  cancelRequested = false;
  pauseWaiters: Array<() => void> = [];
  userActionWaiters: Array<() => void> = [];
  eventSequence = 0;
  execution: Promise<void> | null = null;
  hostSequence = 0;
  hostPending = new Map<string, PendingHostRequest>();
  sandbox: { close: () => Promise<void> } | null = null;
  checkpoint: InstanceType<typeof CheckpointStore> | null = null;
  lastActionAt = 0;
  consecutiveFailures = 0;
  adapterSource: 'embedded' | 'download' | 'cache' = 'embedded';
  completedStepIds = new Set<string>();

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
    const embeddedScript = resolveScript(tool.launchGrant?.scriptKey || String(tool.scriptKey || ''));
    const manifest = asRecord(tool.launchGrant?.toolManifest);
    const hasRemoteArtifact = tool.executionMode === 'live' && manifest.artifactSha256 && manifest.artifactSha256 !== 'embedded';
    const signature = hasRemoteArtifact
      ? verifyToolManifest(tool, process.env.TOOLBOX_TOOL_SIGNING_PUBLIC_KEY_B64 || '')
      : { verified: false };
    const resolvedAdapter = await resolveSignedAdapter(
      tool,
      embeddedScript,
      path.join(PROFILE_ROOT, 'adapter-cache'),
      CONTROL_API_BASE,
      signature.verified,
    );
    this.script = resolvedAdapter.adapter;
    this.adapterSource = resolvedAdapter.source;
    this.steps = createSteps(tool, this.script);
    this.status = 'running';
    this.cancelRequested = false;
    this.userActionWaiters = [];
    this.eventSequence = 0;
    this.consecutiveFailures = 0;
    this.lastActionAt = 0;
    this.completedStepIds.clear();

    this.emit(EVENTS.RUN_STARTED, {
      tool: publicTool(tool),
      steps: this.steps,
      startedAt: Date.now(),
      runner: { kind: 'node-playwright', protocolVersion: PROTOCOL_VERSION },
      adapter: { key: this.script.key, version: this.script.version, source: this.adapterSource },
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
    const embedded = this.tool.browserMode === 'embedded-cdp';
    const input = { ...(this.script.defaultInput || {}), ...asRecord(this.tool.executionContext?.input) };
    const result: UnknownRecord = {
      runner: embedded ? 'node-embedded-cdp' : 'node-playwright',
      scriptKey: this.script.key,
      scriptName: this.script.name,
      adapterVersion: this.script.version,
      adapterSource: this.adapterSource,
      recordKind: this.tool.executionMode === 'live' ? 'live' : 'demo',
    };
    try {
      await this.runStep('prepare', async () => {
        const verification = await this.verifyGrant();
        result.signatureVerified = verification.signatureVerified;
        this.validateInput(input);
        fs.mkdirSync(PROFILE_ROOT, { recursive: true });
        fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
        const checkpointKey = this.tool.executionContext?.sessionId || `${this.script.key}_${this.tool.id || 'tool'}`;
        this.checkpoint = new CheckpointStore(path.join(PROFILE_ROOT, 'checkpoints'), checkpointKey, String(this.script.key || ''), input);

        if (this.script.sandbox && !MOCK_MODE) {
          const sandbox = await startSandboxServer(this.script);
          this.sandbox = sandbox;
          this.tool.targetUrl = sandbox.url;
          result.sandbox = true;
        }
        if (this.script.sandbox && MOCK_MODE) this.tool.targetUrl = 'http://127.0.0.1/mock-automation-sandbox';
        if (MOCK_MODE) { result.browser = 'mock'; await this.sleep(20); return; }

        if (embedded) {
          const browser = await this.hostRequest('browser.prepare');
          result.browser = browser.mode;
          result.webContentsId = browser.webContentsId;
          return;
        }

        const executablePaths = findBrowserExecutables();
        if (!executablePaths.length) throw this.runnerError('BROWSER_NOT_FOUND', '未找到 Chrome 或 Edge，请先安装其中一个浏览器');
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
          } catch (error) { launchError = error; }
        }
        if (!this.context) throw this.runnerError('BROWSER_LAUNCH_FAILED', `Chrome/Edge 启动失败：${failure(launchError).message}`);
        this.page = this.context.pages()[0] || await this.context.newPage();
        result.browser = path.basename(executablePath || 'browser');
        result.profile = safeProfileName(this.tool);
      });

      await this.runStep('open', async () => {
        const targetUrl = this.validTargetUrl();
        this.assertAllowedTarget(targetUrl);
        if (embedded) {
          const navigation = await this.hostRequest('browser.navigate', { url: targetUrl }, 50000);
          result.finalUrl = navigation.url;
        } else if (!MOCK_MODE) {
          await this.requirePage().goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        } else await this.sleep(20);
        this.emit(EVENTS.BROWSER_NAVIGATED, { url: targetUrl });
      });

      await this.runStep('inspect', async () => {
        if (MOCK_MODE) { result.pageTitle = 'Runner Mock Page'; await this.sleep(20); return; }
        await this.handleInterruptionIfNeeded();
        const pageMap = embedded
          ? await this.hostRequest('browser.scan')
          : await scanPlaywrightPage(this.requirePage());
        const scan = persistPageScan(path.join(ARTIFACT_ROOT, 'page-scans'), String(this.script.key || 'unknown'), pageMap);
        result.pageTitle = pageMap.title;
        result.pageFingerprint = scan.fingerprint;
        result.pageChanged = scan.changed;
        result.scanReport = scan.reportPath;
        this.emit(EVENTS.ARTIFACT_CREATED, {
          artifact: { type: 'page-scan', path: scan.reportPath, name: '页面结构扫描报告', fingerprint: scan.fingerprint, changed: scan.changed },
        });
        if (this.script.requestedKey && !(this.script.steps?.length)) {
          throw this.runnerError('ADAPTER_SCAN_REQUIRED', '当前工具尚无可执行适配器，已生成页面扫描报告');
        }
        if (this.tool.executionMode === 'live' && scan.changed) {
          throw this.runnerError('PAGE_CHANGED', '平台页面结构已变化，已停止当前工具；请根据扫描报告更新适配器后重试');
        }
      });

      for (const rawStep of this.script.steps || []) {
        if (!rawStep.id) continue;
        await this.runStep(rawStep.id, async () => {
          for (const action of rawStep.actions || []) await this.executeAction(action, input, rawStep.id as string);
        });
      }

      await this.runStep('verify', async () => {
        for (const check of this.script.successChecks || []) await this.executeAction(check, input, 'verify');
        if (MOCK_MODE) return;
        const artifactPath = path.join(ARTIFACT_ROOT, `${runId}.png`);
        if (embedded) {
          const screenshot = await this.hostRequest('browser.screenshot');
          if (typeof screenshot.base64 !== 'string') throw this.runnerError('BROWSER_SCREENSHOT_INVALID', '浏览器截图数据无效');
          fs.writeFileSync(artifactPath, Buffer.from(screenshot.base64, 'base64'), { mode: 0o600 });
        } else await this.requirePage().screenshot({ path: artifactPath, fullPage: false });
        result.screenshot = artifactPath;
        if (input.freight_quote) result.freightQuote = input.freight_quote;
        if (input.suggested_quantity !== undefined) result.suggestedQuantity = input.suggested_quantity;
        this.emit(EVENTS.ARTIFACT_CREATED, { artifact: { type: 'screenshot', path: artifactPath, name: '运行结果截图' } });
      });

      await this.runStep('summary', async () => { await this.sleep(MOCK_MODE ? 20 : 200); });

      this.ensureActive();
      this.checkpoint?.clear();
      const report = await this.reportExecution('succeeded', result).catch(error => ({ executionId: undefined, warning: failure(error).message }));
      if (report.executionId) result.serverExecutionId = report.executionId;
      if (report.warning) result.reportWarning = report.warning;
      this.status = 'completed';
      this.emit(EVENTS.RUN_COMPLETED, {
        result: { ...result, summary: this.script.sandbox ? '本地交互沙盒已完成真实点击、填写和结果核验' : '平台任务已执行并通过结果核验', completedSteps: this.steps.length },
      });
    } catch (error) {
      const runError = failure(error, '本地任务执行失败');
      if (this.cancelRequested || runError.code === 'RUN_CANCELLED') return;
      await this.reportExecution('failed', result, runError.code || 'RUNNER_ERROR').catch(() => undefined);
      this.status = 'failed';
      this.emit(EVENTS.RUN_FAILED, {
        stepId: runError.stepId,
        error: { code: runError.code || 'RUNNER_ERROR', message: runError.message || '本地任务执行失败', actionId: runError.actionId },
      });
    }
  }

  validateInput(input: UnknownRecord): void {
    for (const field of this.script.inputSchema || []) {
      if (!field.key || field.required === false) continue;
      const value = input[field.key];
      if (value === undefined || value === null || value === '') throw this.runnerError('INPUT_REQUIRED', `缺少必填参数：${field.label || field.key}`);
    }
  }

  async executeAction(action: WorkflowAction, input: UnknownRecord, stepId: string): Promise<void> {
    if (!action.id) return;
    if (action.idempotent && this.checkpoint?.has(action.id)) return;
    if (action.kind === 'calculate') {
      await this.executeCalculation(action, input);
      this.checkpoint?.mark(action.id);
      return;
    }
    const attempts = Math.min(Math.max(Number(action.retries) || 2, 1), 4);
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      await this.waitWhilePaused();
      this.ensureActive();
      await this.handleInterruptionIfNeeded();
      await this.throttle();
      try {
        if (MOCK_MODE) await this.sleep(20);
        else if (this.tool.browserMode === 'embedded-cdp') await this.hostRequest('browser.action', { action, input }, Number(action.timeoutMs) || 15000);
        else await executePlaywrightAction(this.requirePage(), action, input);
        this.consecutiveFailures = 0;
        this.checkpoint?.mark(action.id);
        return;
      } catch (error) {
        lastError = error;
        const actionFailure = failure(error);
        actionFailure.stepId = stepId;
        actionFailure.actionId = action.id;
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          throw this.runnerError('AUTOMATION_CIRCUIT_OPEN', '连续页面操作失败，已停止当前工具以避免反复请求');
        }
        if (attempt >= attempts || !isTransientActionError(error)) throw actionFailure;
        this.emit(EVENTS.STEP_RETRYING, { stepId, actionId: action.id, retryCount: attempt, message: actionFailure.message });
        await this.sleep(Math.min(750 * (2 ** (attempt - 1)), 4000));
      }
    }
    throw failure(lastError, '页面操作失败');
  }

  async executeCalculation(action: WorkflowAction, input: UnknownRecord): Promise<void> {
    if (action.formula === 'freight') {
      const pack = await loadDefaultFreightPack();
      const dimensions = [input.length_cm, input.width_cm, input.height_cm].every(value => Number.isFinite(Number(value)) && Number(value) > 0)
        ? { length: Number(input.length_cm), width: Number(input.width_cm), height: Number(input.height_cm) }
        : undefined;
      const quote = quoteFreight(pack, {
        country: String(input.country || ''),
        actualWeightKg: Number(input.weight_kg),
        dimensionsCm: dimensions,
      });
      if (!quote.selected) throw this.runnerError('FREIGHT_CHANNEL_UNAVAILABLE', quote.warnings.join('；') || '没有可用物流渠道');
      input[action.outputKey || 'freight_quote'] = quote;
      input.freight_quote = quote;
      input.recommended_carrier = quote.selected.carrierName;
      input.carrier = quote.selected.carrierName;
      input.shipping_price = quote.selected.totalUsd;
      input.rate_pack_version = quote.ratePackVersion;
      return;
    }
    if (action.formula !== 'replenishment') throw this.runnerError('CALCULATION_UNSUPPORTED', `不支持的本地计算规则：${action.formula || 'unknown'}`);
    const demand = Number(input.order_demand);
    const stock = Number(input.current_stock);
    const safetyPercent = Number(input.safety_percent || 0);
    if (![demand, stock, safetyPercent].every(Number.isFinite) || demand < 0 || stock < 0 || safetyPercent < 0 || safetyPercent > 500) {
      throw this.runnerError('CALCULATION_INPUT_INVALID', '订单需求、当前库存或安全库存比例无效');
    }
    const outputKey = action.outputKey || 'suggested_quantity';
    input[outputKey] = Math.max(0, Math.ceil(demand * (1 + safetyPercent / 100) - stock));
  }

  async handleInterruptionIfNeeded(): Promise<void> {
    if (MOCK_MODE) return;
    for (let round = 0; round < 4; round += 1) {
      const action = this.tool.browserMode === 'embedded-cdp'
        ? await this.hostRequest('browser.detect-interruption')
        : await detectPlaywrightInterruption(this.requirePage());
      if (!action || !Object.keys(action).length) return;
      await this.requestUserAction(action);
      await this.sleep(300);
    }
    throw this.runnerError('USER_ACTION_UNRESOLVED', '页面仍需要登录或验证，本次任务已安全停止');
  }

  async throttle(): Promise<void> {
    const remaining = MIN_ACTION_INTERVAL_MS - (Date.now() - this.lastActionAt);
    if (remaining > 0) await this.sleep(remaining);
    this.lastActionAt = Date.now();
  }

  async runStep(stepId: string, operation: () => Promise<void>) {
    await this.waitWhilePaused();
    this.ensureActive();
    const step = this.steps.find(item => item.id === stepId);
    this.emit(EVENTS.STEP_STARTED, { step });
    try { await operation(); }
    catch (error) { const stepError = failure(error); stepError.stepId ||= stepId; throw stepError; }
    this.ensureActive();
    this.completedStepIds.add(stepId);
    this.emit(EVENTS.STEP_COMPLETED, { stepId });
  }

  async verifyGrant(): Promise<UnknownRecord> {
    const signature = verifyToolManifest(this.tool, process.env.TOOLBOX_TOOL_SIGNING_PUBLIC_KEY_B64 || '');
    if (MOCK_MODE || this.tool.executionMode !== 'live' || this.script.sandbox) return { signatureVerified: signature.verified };
    const grant = this.tool.launchGrant || {};
    if (!grant.token) throw this.runnerError('GRANT_MISSING', '缺少工具启动授权，请重新打开工具');
    if (grant.runnerApiVersion && grant.runnerApiVersion !== PROTOCOL_VERSION) throw this.runnerError('RUNNER_VERSION_MISMATCH', '工具与本地 Runner 协议版本不兼容');
    if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) throw this.runnerError('GRANT_EXPIRED', '工具启动授权已过期，请重新打开工具');

    const encodedToken = encodeURIComponent(grant.token);
    const endpoints = ['/api/tools/launch-grant/verify', '/api/tools/launch-token/verify'];
    let lastError;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${CONTROL_API_BASE}${endpoint}?token=${encodedToken}`, { method: 'POST', headers: { 'X-Toolbox-Version': process.env.TOOLBOX_CLIENT_VERSION || 'unknown' } });
        const body = asRecord(await response.json());
        const data = asRecord(body.data);
        if (response.status === 404 && endpoint.includes('launch-grant')) continue;
        if (!response.ok || body.success !== true || data.valid !== true) {
          const message = typeof body.message === 'string' ? body.message : typeof body.detail === 'string' ? body.detail : '启动授权验证失败';
          throw this.runnerError('GRANT_REJECTED', message);
        }
        if (data.tool_id !== this.tool.id) throw this.runnerError('GRANT_TOOL_MISMATCH', '启动授权与当前工具不匹配');
        const execution = this.tool.executionContext;
        if (execution?.mode === 'batch' && (data.execution_mode !== 'batch' || data.client_batch_id !== execution.batchId || data.client_item_id !== execution.itemId)) {
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

  async reportExecution(status: 'succeeded' | 'failed', result: UnknownRecord, errorCode?: string): Promise<{ executionId?: number; warning?: string }> {
    if (MOCK_MODE || this.tool.executionMode !== 'live') return {};
    const token = this.tool.launchGrant?.token;
    if (!token || !this.runId) return {};
    const response = await fetch(`${CONTROL_API_BASE}/api/executions/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Toolbox-Version': process.env.TOOLBOX_CLIENT_VERSION || 'unknown' },
      body: JSON.stringify({
        token,
        run_id: this.runId,
        status,
        error_code: errorCode || null,
        adapter_version: this.script.version || null,
        page_fingerprint: typeof result.pageFingerprint === 'string' ? result.pageFingerprint : null,
        page_changed: result.pageChanged === true,
        completed_steps: [...this.completedStepIds].filter(stepId => stepId !== 'summary').length,
      }),
    });
    const body = asRecord(await response.json());
    if (!response.ok || body.success !== true) {
      const message = typeof body.message === 'string' ? body.message : typeof body.detail === 'string' ? body.detail : '执行记录上报失败';
      throw this.runnerError('EXECUTION_REPORT_FAILED', message);
    }
    const data = asRecord(body.data);
    return { executionId: typeof data.execution_id === 'number' ? data.execution_id : undefined };
  }

  validTargetUrl(): string {
    try {
      const url = new URL(this.tool.targetUrl || '');
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      return url.toString();
    } catch { throw this.runnerError('TARGET_URL_INVALID', '工具目标网址无效'); }
  }

  assertAllowedTarget(targetUrl: string): void {
    const url = new URL(targetUrl);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const allowed = (this.script.allowedHosts || []).some(host => hostname === host || hostname.endsWith(`.${host}`));
    if (!allowed) throw this.runnerError('TARGET_HOST_NOT_ALLOWED', `当前适配器不允许访问该域名：${hostname}`);
    if (/sellercentral\.amazon|sellercenter\.aliexpress/i.test(hostname)) {
      throw this.runnerError('REAL_COMMERCE_HOST_BLOCKED', '比赛模拟平台适配器禁止在真实电商后台运行');
    }
  }

  pause() { if (this.status !== 'running') return { status: this.status }; this.status = 'paused'; this.emit(EVENTS.RUN_PAUSED); return { status: this.status }; }
  resume() { if (this.status !== 'paused') return { status: this.status }; this.status = 'running'; this.pauseWaiters.splice(0).forEach(resolve => resolve()); this.emit(EVENTS.RUN_RESUMED); return { status: this.status }; }

  requestUserAction(action: UnknownRecord = {}): Promise<void> {
    this.status = 'waiting_user';
    this.emit(EVENTS.USER_ACTION_REQUIRED, { action });
    return new Promise<void>(resolve => this.userActionWaiters.push(resolve));
  }

  completeUserAction() {
    if (this.status !== 'waiting_user') return { status: this.status };
    this.status = 'running';
    this.userActionWaiters.splice(0).forEach(resolve => resolve());
    this.emit(EVENTS.USER_ACTION_COMPLETED);
    return { status: this.status };
  }

  async cancel(emitEvent = true) {
    if (['idle', 'completed', 'failed', 'cancelled'].includes(this.status)) { await this.closeBrowser(); return { status: this.status }; }
    this.cancelRequested = true;
    this.status = 'cancelled';
    this.pauseWaiters.splice(0).forEach(resolve => resolve());
    this.userActionWaiters.splice(0).forEach(resolve => resolve());
    await this.closeBrowser();
    if (emitEvent) this.emit(EVENTS.RUN_CANCELLED);
    return { status: this.status };
  }

  waitWhilePaused(): Promise<void> { return this.status !== 'paused' ? Promise.resolve() : new Promise(resolve => this.pauseWaiters.push(resolve)); }
  ensureActive(): void { if (this.cancelRequested || this.status === 'cancelled') throw this.runnerError('RUN_CANCELLED', '任务已取消'); }
  sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }

  async closeBrowser() {
    if (this.tool?.browserMode === 'embedded-cdp' && !MOCK_MODE) { try { await this.hostRequest('browser.detach'); } catch {} }
    const context = this.context;
    this.context = null;
    this.page = null;
    if (context) { try { await context.close(); } catch {} }
    const sandbox = this.sandbox;
    this.sandbox = null;
    if (sandbox) { try { await sandbox.close(); } catch {} }
  }

  requirePage(): import('playwright-core').Page { if (!this.page) throw this.runnerError('BROWSER_PAGE_MISSING', '浏览器页面尚未准备好'); return this.page; }
  runnerError(code: string, message: string): RunnerFailure { return Object.assign(new Error(message), { code }); }

  hostRequest(action: string, payload: UnknownRecord = {}, timeoutMs = 15000): Promise<UnknownRecord> {
    this.hostSequence += 1;
    const id = `host_${Date.now()}_${this.hostSequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.hostPending.delete(id); reject(this.runnerError('BROWSER_HOST_TIMEOUT', `浏览器动作超时: ${action}`)); }, timeoutMs);
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
      pending.reject(this.runnerError(typeof hostError.code === 'string' ? hostError.code : 'BROWSER_HOST_ERROR', typeof hostError.message === 'string' ? hostError.message : '浏览器动作失败'));
    }
  }

  async shutdown() { await this.cancel(false); return { stopped: true }; }
}

const runtime = new AutomationRuntime();

process.on('message', async (rawMessage: unknown) => {
  const message = asRecord(rawMessage);
  if (message.type === 'host-response') { runtime.handleHostResponse(message); return; }
  if (message.type !== 'command') return;
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
    process.send?.({ type: 'response', id, ok: false, error: { code: commandError.code || 'RUNNER_COMMAND_FAILED', message: commandError.message } });
  }
});

process.on('disconnect', () => runtime.shutdown().finally(() => process.exit(0)));
process.on('SIGTERM', () => runtime.shutdown().finally(() => process.exit(0)));
