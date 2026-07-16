const { RunnerClient } = require('./runner-client.cjs');

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

type UnknownRecord = Record<string, unknown>;

interface RunnerEvent extends UnknownRecord {
  type: string;
  action?: { type?: string; instruction?: string };
  error?: { message?: string };
}

interface RunnerLike {
  start(tool: UnknownRecord): Promise<unknown>;
  stop(): Promise<unknown>;
  completeUserAction(): Promise<unknown>;
}

interface HostManagerLike {
  register(itemId: string, guest: unknown): unknown;
  release(itemId: string): unknown;
  releaseAll(): unknown;
  isReady(itemId: string): boolean;
  request(itemId: string, action: string, payload: UnknownRecord): Promise<unknown> | unknown;
  size(): number;
}

interface ImportedRow {
  itemId: string;
  input: UnknownRecord;
  preview: UnknownRecord;
  accountLabelMasked: string;
}

interface ParsedImport {
  importId: string;
  fileName: string;
  rows: ImportedRow[];
  errors: unknown[];
}

interface BatchItem {
  itemId: string;
  input: UnknownRecord | null;
  accountLabelMasked: string;
  status: string;
  interventionType: string | null;
  message: string;
  runner: RunnerLike | null;
  browserReady: boolean;
  readyToResume: boolean;
  notifiedInterventions: Set<string>;
}

interface ActiveBatch {
  batchId: string;
  serverBatchId?: string | number;
  tool: UnknownRecord;
  status: string;
  maxOpenSessions: number;
  items: BatchItem[];
}

interface RunnerFactoryOptions {
  scriptPath: string;
  env: NodeJS.ProcessEnv;
  onEvent: (event: RunnerEvent) => void;
  onHostRequest: (action: string, payload: UnknownRecord) => Promise<unknown> | unknown;
}

interface CoordinatorOptions {
  scriptPath?: string;
  env?: NodeJS.ProcessEnv;
  hostManager?: HostManagerLike;
  onEvent?: (event: UnknownRecord) => void;
  onNotify?: (payload: { itemId: string; accountLabelMasked: string; type: string }) => void;
  runnerFactory?: (options: RunnerFactoryOptions) => RunnerLike;
}

class BatchCoordinator {
  scriptPath: string;
  env: NodeJS.ProcessEnv;
  hostManager: HostManagerLike;
  onEvent: (event: UnknownRecord) => void;
  onNotify: (payload: { itemId: string; accountLabelMasked: string; type: string }) => void;
  runnerFactory: (options: RunnerFactoryOptions) => RunnerLike;
  imports: Map<string, ImportedRow[]>;
  batch: ActiveBatch | null;
  activeItemId: string | null;
  provisioningItemId: string | null;

  constructor({ scriptPath = '', env, hostManager, onEvent = () => {}, onNotify = () => {}, runnerFactory }: CoordinatorOptions = {}) {
    if (!hostManager) throw new Error('BatchCoordinator requires hostManager');
    this.scriptPath = scriptPath;
    this.env = env || {};
    this.hostManager = hostManager;
    this.onEvent = onEvent;
    this.onNotify = onNotify;
    this.runnerFactory = runnerFactory || ((options: RunnerFactoryOptions) => new RunnerClient(options) as RunnerLike);
    this.imports = new Map<string, ImportedRow[]>();
    this.batch = null;
    this.activeItemId = null;
    this.provisioningItemId = null;
  }

  storeImport(parsed: ParsedImport) {
    this.imports.set(parsed.importId, parsed.rows);
    return {
      importId: parsed.importId,
      fileName: parsed.fileName,
      validCount: parsed.rows.length,
      errorCount: parsed.errors.length,
      rows: parsed.rows.map(row => ({ itemId: row.itemId, preview: row.preview, accountLabelMasked: row.accountLabelMasked })),
      errors: parsed.errors,
    };
  }

  create({ importId, batchId, serverBatchId, tool, maxOpenSessions = 6 }: { importId: string; batchId: string; serverBatchId?: string | number; tool: UnknownRecord; maxOpenSessions?: number }) {
    if (this.batch && this.batch.status === 'running') throw this.error('BATCH_ACTIVE', '已有批次正在执行');
    const importedRows = this.imports.get(importId);
    if (!importedRows?.length) throw this.error('BATCH_IMPORT_MISSING', '导入数据已经失效，请重新选择文件');
    this.imports.clear();
    this.batch = {
      batchId,
      serverBatchId,
      tool: { ...tool },
      status: 'running',
      maxOpenSessions: Math.min(Math.max(Number(maxOpenSessions) || 6, 2), 10),
      items: importedRows.map(row => ({
        itemId: row.itemId,
        input: row.input,
        accountLabelMasked: row.accountLabelMasked,
        status: 'pending',
        interventionType: null,
        message: '',
        runner: null,
        browserReady: false,
        readyToResume: false,
        notifiedInterventions: new Set(),
      })),
    };
    this.emit('batch.created');
    this.schedule();
    return this.snapshot();
  }

  registerBrowser(itemId: string, guest: unknown) {
    const item = this.requireItem(itemId);
    const result = this.hostManager.register(itemId, guest);
    item.browserReady = true;
    this.emit('batch.browser_ready', { itemId });
    return result;
  }

  unregisterBrowser(itemId: string) {
    const item = this.batch?.items.find(candidate => candidate.itemId === itemId);
    if (item) item.browserReady = false;
    return this.hostManager.release(itemId);
  }

  async startItem(itemId: string, tool: UnknownRecord) {
    const item = this.requireItem(itemId);
    const batch = this.batch;
    if (!batch) throw this.error('BATCH_NOT_FOUND', '批次不存在');
    if (this.activeItemId && this.activeItemId !== itemId) throw this.error('BATCH_RUNNER_BUSY', '另一个账号正在处理');
    if (!this.hostManager.isReady(itemId)) throw this.error('BROWSER_NOT_REGISTERED', '账号浏览器尚未就绪');
    if (TERMINAL.has(item.status)) throw this.error('BATCH_ITEM_TERMINAL', '该账号已经结束');
    this.provisioningItemId = null;
    this.activeItemId = itemId;
    item.status = 'running';
    item.interventionType = null;
    item.message = '';
    const runTool = {
      ...batch.tool,
      ...tool,
      browserMode: 'embedded-cdp',
      executionContext: {
        mode: 'batch',
        batchId: batch.batchId,
        itemId,
        sessionId: `session_${itemId}`,
        input: item.input,
      },
    };
    item.runner = this.createRunner(item);
    this.emit('batch.item_updated', { itemId });
    try {
      return await item.runner.start(runTool);
    } catch (error) {
      this.finishItem(item, 'failed', error instanceof Error ? error.message : '启动失败');
      throw error;
    }
  }

  failProvision(itemId: string, message = '启动授权未通过') {
    const item = this.requireItem(itemId);
    if (this.provisioningItemId !== itemId) return this.snapshot();
    this.provisioningItemId = null;
    item.status = 'failed';
    item.message = message;
    item.interventionType = null;
    item.readyToResume = false;
    this.emit('batch.item_updated', { itemId });
    this.schedule();
    return this.snapshot();
  }

  async completeUserAction(itemId: string) {
    const item = this.requireItem(itemId);
    if (item.status !== 'waiting_user') return this.snapshot();
    item.readyToResume = true;
    item.message = '已确认操作，等待继续处理';
    this.emit('batch.item_updated', { itemId });
    this.schedule();
    return this.snapshot();
  }

  async restartItem(itemId: string) {
    const item = this.requireItem(itemId);
    if (item.status !== 'failed') throw this.error('BATCH_ITEM_NOT_FAILED', '只有未完成账号可以重新发起');
    await item.runner?.stop?.().catch(() => {});
    item.runner = null;
    item.status = 'pending';
    item.message = '';
    item.interventionType = null;
    this.emit('batch.item_updated', { itemId });
    this.schedule();
    return this.snapshot();
  }

  async cancel(status = 'cancelled') {
    if (!this.batch) return { status: 'idle' };
    const runners = this.batch.items.flatMap((item) => item.runner ? [item.runner.stop()] : []);
    await Promise.allSettled(runners);
    for (const item of this.batch.items) {
      if (!TERMINAL.has(item.status)) item.status = 'cancelled';
      item.input = null;
      item.runner = null;
    }
    this.batch.status = status;
    this.activeItemId = null;
    this.provisioningItemId = null;
    this.hostManager.releaseAll();
    this.emit('batch.finished');
    return this.snapshot();
  }

  createRunner(item: BatchItem): RunnerLike {
    return this.runnerFactory({
      scriptPath: this.scriptPath,
      env: this.env,
      onEvent: (event: RunnerEvent) => this.handleRunnerEvent(item, event),
      onHostRequest: (action: string, payload: UnknownRecord) => this.hostManager.request(item.itemId, action, payload),
    });
  }

  handleRunnerEvent(item: BatchItem, event: RunnerEvent) {
    const enriched = { ...event, batchId: this.batch?.batchId, itemId: item.itemId };
    if (event.type === 'user.action_required') {
      item.status = 'waiting_user';
      item.interventionType = event.action?.type || 'other';
      item.message = event.action?.instruction || '需要完成页面操作';
      this.activeItemId = null;
      if (!item.notifiedInterventions.has(item.interventionType)) {
        item.notifiedInterventions.add(item.interventionType);
        this.onNotify({ itemId: item.itemId, accountLabelMasked: item.accountLabelMasked, type: item.interventionType });
      }
      this.emit('batch.item_updated', { itemId: item.itemId, runnerEvent: enriched });
      this.schedule();
      return;
    }
    if (event.type === 'run.completed') this.finishItem(item, 'completed');
    else if (event.type === 'run.failed') this.finishItem(item, 'failed', event.error?.message);
    else if (event.type === 'run.cancelled') this.finishItem(item, 'cancelled');
    else this.emit('batch.runner_event', { itemId: item.itemId, runnerEvent: enriched });
  }

  finishItem(item: BatchItem, status: string, message = '') {
    const batch = this.batch;
    if (!batch) return;
    item.status = status;
    item.message = message || '';
    item.interventionType = null;
    item.readyToResume = false;
    if (this.activeItemId === item.itemId) this.activeItemId = null;
    item.runner?.stop?.().catch(() => {});
    item.runner = null;
    this.emit('batch.item_updated', { itemId: item.itemId });
    if (batch.items.every(candidate => TERMINAL.has(candidate.status))) {
      batch.status = 'completed';
      for (const candidate of batch.items) candidate.input = null;
      this.emit('batch.finished');
      return;
    }
    this.schedule();
  }

  async resumeWaiting(item: BatchItem) {
    if (!item.runner) {
      item.status = 'pending';
      item.readyToResume = false;
      this.schedule();
      return;
    }
    this.activeItemId = item.itemId;
    item.readyToResume = false;
    item.status = 'running';
    this.emit('batch.item_updated', { itemId: item.itemId });
    try {
      await item.runner.completeUserAction();
    } catch (error) {
      this.finishItem(item, 'failed', error instanceof Error ? error.message : '继续处理失败');
    }
  }

  schedule(): void {
    if (!this.batch || this.batch.status !== 'running' || this.activeItemId || this.provisioningItemId) return;
    const resumable = this.batch.items.find(item => item.status === 'waiting_user' && item.readyToResume);
    if (resumable) {
      this.resumeWaiting(resumable);
      return;
    }
    const next = this.batch.items.find(item => item.status === 'pending');
    if (!next) return;
    if (this.hostManager.size() >= this.batch.maxOpenSessions && !this.hostManager.isReady(next.itemId)) {
      this.emit('batch.resource_blocked', { message: '浏览器现场已达上限，请先处理一个需要操作的账号' });
      return;
    }
    this.provisioningItemId = next.itemId;
    this.emit('batch.item_ready', { itemId: next.itemId });
  }

  snapshot(): UnknownRecord {
    if (!this.batch) return { status: 'idle', items: [] };
    const items = this.batch.items.map(item => ({
      itemId: item.itemId,
      accountLabelMasked: item.accountLabelMasked,
      status: item.status,
      interventionType: item.interventionType,
      message: item.message,
      browserReady: item.browserReady,
    }));
    const count = (status: string) => items.filter(item => item.status === status).length;
    return {
      batchId: this.batch.batchId,
      serverBatchId: this.batch.serverBatchId,
      tool: this.batch.tool,
      status: this.batch.status,
      activeItemId: this.activeItemId,
      provisioningItemId: this.provisioningItemId,
      maxOpenSessions: this.batch.maxOpenSessions,
      counts: {
        total: items.length,
        pending: count('pending'),
        running: count('running'),
        waiting: count('waiting_user'),
        completed: count('completed'),
        failed: count('failed'),
      },
      items,
    };
  }

  emit(type: string, payload: UnknownRecord = {}): void {
    this.onEvent({ type, timestamp: Date.now(), ...payload, snapshot: this.snapshot() });
  }

  requireItem(itemId: string): BatchItem {
    const item = this.batch?.items.find(candidate => candidate.itemId === itemId);
    if (!item) throw this.error('BATCH_ITEM_NOT_FOUND', '批次账号不存在');
    return item;
  }

  error(code: string, message: string): Error & { code: string } {
    return Object.assign(new Error(message), { code });
  }
}

module.exports = { BatchCoordinator };
