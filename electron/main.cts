const { app, BrowserWindow, dialog, ipcMain, shell, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const { UpdateManager } = require('./core/update-manager.cjs');
const { registerAppProtocol, registerAppScheme } = require('./core/app-protocol.cjs');
const { BackendProcessManager } = require('./core/backend-process-manager.cjs');
const { CredentialManager } = require('./core/credential-manager.cjs');
const { NotificationManager } = require('./core/notification-manager.cjs');
const { RunnerClient } = require('./automation/runner-client.cjs');
const { EmbeddedBrowserHost } = require('./automation/embedded-browser-host.cjs');
const { EmbeddedBrowserHostManager } = require('./automation/embedded-browser-host-manager.cjs');
const { BatchCoordinator } = require('./automation/batch-coordinator.cjs');
const { parseBatchFile, writeBatchErrors } = require('./automation/batch-importer.cjs');
const { parseFreightWorkbook } = require('./freight/rate-pack.cjs');
const { quoteFreight } = require('../src/shared/freight/rate-engine.js');
const toolSigningConfig = require('./tool-signing-config.cjs');
const packageMetadata = require('../../package.json');
const { resolveRuntimeConfig } = require('./core/runtime-config.cjs');
const { assertTrustedSender } = require('./ipc/sender-guard.js');
const {
  isAllowedExternalUrl,
  isAllowedMainFrameUrl,
  isAllowedWebviewPartition,
  isAllowedWebviewUrl,
} = require('./security/navigation-policy.js');

type UnknownRecord = Record<string, unknown>;
type BrowserWindowType = import('electron').BrowserWindow;
type IpcInvokeEvent = import('electron').IpcMainInvokeEvent;
type IpcEvent = import('electron').IpcMainEvent;

interface RunnerLike {
  start(tool: UnknownRecord): Promise<unknown>;
  pause(): Promise<unknown> | unknown;
  resume(): Promise<unknown> | unknown;
  completeUserAction(): Promise<unknown> | unknown;
  cancel(): Promise<unknown>;
  stop(): Promise<unknown>;
}

interface CoordinatorLike {
  storeImport(parsed: unknown): unknown;
  remapImportItems(importId: string, itemIds: string[]): unknown;
  create(payload: UnknownRecord): unknown;
  startItem(itemId: string, tool: UnknownRecord): Promise<unknown>;
  failProvision(itemId: string, message?: string): unknown;
  completeUserAction(itemId: string): Promise<unknown>;
  restartItem(itemId: string): Promise<unknown>;
  cancel(status?: string): Promise<unknown>;
  snapshot(): UnknownRecord;
  registerBrowser(itemId: string, guest: import('electron').WebContents): unknown;
  unregisterBrowser(itemId: string): unknown;
}

interface UpdateManagerLike {
  activityChanged(): void;
  check(): Promise<unknown>;
  install(): Promise<unknown>;
  isInstalling(): boolean;
  shouldInstallOnQuit(): boolean;
}

function asRecord(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : {};
}

function errorMessage(error: unknown, fallback = '未知错误'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function installBusyError(message: string): Error & { code: 'INSTALL_BUSY' } {
  return Object.assign(new Error(message), { code: 'INSTALL_BUSY' as const });
}

process.env.TOOLBOX_CLIENT_VERSION = app.getVersion();

let mainWindow: BrowserWindowType | null = null;
let automationRunner: RunnerLike | null = null;
let batchCoordinator: CoordinatorLike | null = null;
let selectedBatchImportPath: string | null = null;
let selectedFreightWorkbookPath: string | null = null;
let defaultFreightPackCache: { mtimeMs: number; parsed: UnknownRecord } | null = null;
let selectedBatchItemId: string | null = null;
let allowWindowClose = false;
let updateManager: UpdateManagerLike | null = null;
let singleRunActive = false;
let shutdownReady = false;
let shutdownPromise: Promise<void> | null = null;
const demoActivityTokens = new Set<string>();
const embeddedBrowserHost = new EmbeddedBrowserHost();
const batchBrowserHosts = new EmbeddedBrowserHostManager();

registerAppScheme();

app.on('web-contents-created', (_event: unknown, contents: import('electron').WebContents) => {
  if (contents.getType() !== 'webview') return;
  const keepWebviewOnHttps = (event: import('electron').Event, url: string): void => {
    if (!isAllowedWebviewUrl(url)) event.preventDefault();
  };
  contents.on('will-navigate', keepWebviewOnHttps);
  contents.on('will-redirect', keepWebviewOnHttps);
  contents.setWindowOpenHandler(({ url }: { url: string }) => {
    if (mayOpenExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
});

function stableDeviceIdentity(): { deviceId: string; deviceName: string } {
  const source = [os.hostname(), os.homedir(), os.platform(), os.arch()].join('|');
  const digest = crypto.createHash('sha256').update(source).digest('hex').slice(0, 20).toUpperCase();
  return { deviceId: `DEV-${digest}`, deviceName: os.hostname() || 'Windows 设备' };
}

const DEVICE_IDENTITY = stableDeviceIdentity();

// Keep customer runtime data off the system drive by default. The environment
// override remains available for deployments that need a different location.
function configureRuntimeRoot(): string {
  const preferredRoot = process.env.TOOLBOX_RUNTIME_DIR || 'D:\\AmazonToolboxData';
  try {
    fs.mkdirSync(preferredRoot, { recursive: true });
    app.setPath('userData', preferredRoot);
    app.setPath('sessionData', path.join(preferredRoot, 'session-data'));
    return preferredRoot;
  } catch (error) {
    console.warn('[Runtime] Unable to use preferred data directory:', errorMessage(error));
    return app.getPath('userData');
  }
}

const RUNTIME_ROOT = configureRuntimeRoot();
const backendManager = new BackendProcessManager({
  runtimeRoot: RUNTIME_ROOT,
  resourcesPath: () => app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), 'electron'),
});
const credentialManager = new CredentialManager({ ipcMain, getWindow: () => mainWindow });
const notificationManager = new NotificationManager({
  getWindow: () => mainWindow,
  getSelectedBatchItemId: () => selectedBatchItemId,
});

// ===== 单实例锁 =====
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// 云端控制面地址。配置为远程 HTTPS 后，桌面端不会再启动打包的 Python 后端。
const INTERNAL_PRODUCTION = app.isPackaged && packageMetadata.toolbox?.distribution === 'internal';
// The packaged client may carry the local Runner while the server still keeps
// every catalog entry in demo_only mode. Live execution remains guarded by the
// catalog capability, one-time launch grant, signed manifest and host allowlist.
const AUTOMATION_RUNTIME_ENABLED = packageMetadata.toolbox?.automationRuntime === true
  || process.env.TOOLBOX_AUTOMATION_ENABLED === 'true';
const runtimeConfig = resolveRuntimeConfig(
  process.env,
  packageMetadata,
) as { controlApiBase: string; useBundledBackend: boolean };
const CONTROL_API_BASE = runtimeConfig.controlApiBase;
const USE_BUNDLED_BACKEND = runtimeConfig.useBundledBackend;
if (INTERNAL_PRODUCTION && USE_BUNDLED_BACKEND) {
  throw new Error('Internal production builds cannot start a bundled backend');
}

function mayOpenExternalUrl(url: string): boolean {
  return isAllowedExternalUrl(url, INTERNAL_PRODUCTION);
}

function registerTrustedHandle<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (event: IpcInvokeEvent, ...args: TArgs) => TResult,
): void {
  ipcMain.handle(channel, (event: IpcInvokeEvent, ...args: unknown[]) => {
    assertTrustedSender(event, () => mainWindow, !app.isPackaged);
    return handler(event, ...(args as TArgs));
  });
}

function registerAutomationHandle<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (event: IpcInvokeEvent, ...args: TArgs) => TResult,
): void {
  if (AUTOMATION_RUNTIME_ENABLED) registerTrustedHandle(channel, handler);
}

function registerTrustedOn<TArgs extends unknown[]>(
  channel: string,
  handler: (event: IpcEvent, ...args: TArgs) => void | Promise<void>,
): void {
  ipcMain.on(channel, (event: IpcEvent, ...args: unknown[]) => {
    try {
      assertTrustedSender(event, () => mainWindow, !app.isPackaged);
      void handler(event, ...(args as TArgs));
    } catch (error) {
      console.warn(`[IPC] Rejected ${channel}:`, errorMessage(error));
    }
  });
}

// ===== 分屏模式：在系统浏览器中打开外部链接 =====
registerTrustedHandle('open-external', async (_event: IpcInvokeEvent, url: unknown) => {
  if (typeof url === 'string' && mayOpenExternalUrl(url)) {
    await shell.openExternal(url);
    return { success: true };
  }
  return { success: false, message: '无效的 URL' };
});

// ===== 工具启动控制（内部 IPC 直通处理） =====
if (AUTOMATION_RUNTIME_ENABLED) registerTrustedOn('launch-tool', async (event: IpcEvent, rawData: unknown) => {
  const { shell, net } = require('electron');
  const data = asRecord(rawData);
  const launchData = asRecord(data.launchData);
  const toolName = typeof data.toolName === 'string' ? data.toolName : '未知工具';
  
  console.log('[LaunchTool] 启动工具:', toolName, 'toolId:', launchData.tool_id);
  
  // 兼容旧的 launchUrl 模式
  if (!launchData.token && typeof data.launchUrl === 'string') {
    const launchUrl = data.launchUrl;
    if (mayOpenExternalUrl(launchUrl)) {
      await shell.openExternal(launchUrl);
      event.sender.send('launch-tool-success', { toolName });
      return;
    }
    event.sender.send('launch-tool-error', { message: '不支持的启动链接格式' });
    return;
  }
  
  // 校验结构化数据
  if (!launchData.token || !launchData.tool_id) {
    event.sender.send('launch-tool-error', { message: '工具启动数据不完整' });
    return;
  }
  
  try {
    const verifyUrl = `${CONTROL_API_BASE}/api/tools/launch-grant/verify?token=${encodeURIComponent(String(launchData.token))}`;
    
    const request = net.request({ method: 'POST', url: verifyUrl });
    
    request.on('response', (response: import('electron').IncomingMessage) => {
      let body = '';
      response.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      response.on('end', () => {
        try {
          const result = asRecord(JSON.parse(body) as unknown);
          const resultData = asRecord(result.data);
          
          if (result.success === true && resultData.valid === true) {
            console.log('[LaunchTool] Token 验证通过');
            event.sender.send('launch-tool-success', { 
              toolName,
              platformKey: launchData.platform_key,
            });
          } else {
            const errMsg = typeof result.message === 'string' ? result.message : 'Token 验证失败';
            console.error('[LaunchTool] Token 验证失败:', errMsg);
            event.sender.send('launch-tool-error', { message: errMsg });
          }
        } catch (parseErr) {
          console.error('[LaunchTool] 解析验证响应失败:', errorMessage(parseErr));
          event.sender.send('launch-tool-error', { message: '工具启动验证失败' });
        }
      });
    });
    
    request.on('error', (err: Error) => {
      console.error('[LaunchTool] 验证请求失败:', err.message);
      event.sender.send('launch-tool-error', { message: '网络连接失败，请检查后端服务' });
    });
    
    request.end();
  } catch (err) {
    const message = errorMessage(err);
    console.error('[LaunchTool] 启动工具异常:', message);
    event.sender.send('launch-tool-error', { message: '工具启动失败: ' + message });
  }
});

// ===== 安全凭据存储 =====
// ===== 本地 Node Automation Runner =====
function getAutomationRunner(): RunnerLike {
  if (automationRunner) return automationRunner;
  automationRunner = new RunnerClient({
    scriptPath: path.join(__dirname, 'automation-runner.cjs'),
    env: {
      TOOLBOX_CONTROL_API_URL: CONTROL_API_BASE,
      TOOLBOX_PROFILE_ROOT: path.join(app.getPath('userData'), 'automation-profiles'),
      TOOLBOX_ARTIFACT_ROOT: path.join(app.getPath('userData'), 'automation-artifacts'),
      PLAYWRIGHT_BROWSERS_PATH: path.join(RUNTIME_ROOT, 'playwright-browsers'),
      TOOLBOX_FREIGHT_RATE_WORKBOOK: defaultFreightWorkbookPath(),
      TOOLBOX_TOOL_SIGNING_PUBLIC_KEY_B64: process.env.TOOLBOX_TOOL_SIGNING_PUBLIC_KEY_B64 || toolSigningConfig.publicKeyB64,
    },
    onEvent: (rawEvent: unknown) => {
      const event = asRecord(rawEvent);
      if (event.type === 'run.started' || event.type === 'run.preparing') singleRunActive = true;
      if (typeof event.type === 'string' && ['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)) singleRunActive = false;
      updateManager?.activityChanged();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('automation:event', event);
      }
      if (event.type === 'user.action_required') {
        const action = asRecord(event.action);
        notificationManager.show({
          title: '自动处理需要你的操作',
          body: typeof action.title === 'string' ? action.title : '请返回工具箱完成页面操作',
          focus: { mode: 'single' },
        });
      }
    },
    onHostRequest: (action: string, payload: UnknownRecord) => embeddedBrowserHost.request(action, payload),
  }) as RunnerLike;
  return automationRunner;
}

registerAutomationHandle('automation:start', async (_event: IpcInvokeEvent, rawTool: unknown) => {
  const tool = asRecord(rawTool);
  if (!tool.id) throw new Error('工具启动数据不完整');
  return getAutomationRunner().start({
    ...tool,
    browserMode: embeddedBrowserHost.isReady() ? 'embedded-cdp' : 'playwright',
  });
});

registerTrustedHandle(
  'demo-activity:set-active',
  (_event: IpcInvokeEvent, token: unknown, active: unknown): void => {
    if (typeof token !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(token)) {
      throw new TypeError('Invalid demo activity token');
    }
    if (typeof active !== 'boolean') throw new TypeError('Invalid demo activity state');
    if (active) demoActivityTokens.add(token);
    else demoActivityTokens.delete(token);
    updateManager?.activityChanged();
  },
);
registerAutomationHandle('automation:pause', () => getAutomationRunner().pause());
registerAutomationHandle('automation:resume', () => getAutomationRunner().resume());
registerAutomationHandle('automation:complete-user-action', () => getAutomationRunner().completeUserAction());
registerAutomationHandle('automation:cancel', () => getAutomationRunner().cancel());
registerAutomationHandle('automation:register-browser', (event: IpcInvokeEvent, webContentsId: unknown) => {
  const guest = webContents.fromId(Number(webContentsId));
  if (!guest || guest.getType?.() !== 'webview') throw new Error('无法注册工作区浏览器');
  if (guest.hostWebContents && guest.hostWebContents.id !== event.sender.id) {
    throw new Error('工作区浏览器归属校验失败');
  }
  return embeddedBrowserHost.register(guest);
});
registerAutomationHandle('automation:unregister-browser', () => embeddedBrowserHost.release());

function runnerEnvironment(): NodeJS.ProcessEnv {
  return {
    TOOLBOX_CONTROL_API_URL: CONTROL_API_BASE,
    TOOLBOX_PROFILE_ROOT: path.join(app.getPath('userData'), 'automation-profiles'),
    TOOLBOX_ARTIFACT_ROOT: path.join(app.getPath('userData'), 'automation-artifacts'),
    PLAYWRIGHT_BROWSERS_PATH: path.join(RUNTIME_ROOT, 'playwright-browsers'),
    TOOLBOX_FREIGHT_RATE_WORKBOOK: defaultFreightWorkbookPath(),
    TOOLBOX_TOOL_SIGNING_PUBLIC_KEY_B64: process.env.TOOLBOX_TOOL_SIGNING_PUBLIC_KEY_B64 || toolSigningConfig.publicKeyB64,
  };
}

function getBatchCoordinator(): CoordinatorLike {
  if (batchCoordinator) return batchCoordinator;
  batchCoordinator = new BatchCoordinator({
    scriptPath: path.join(__dirname, 'automation-runner.cjs'),
    env: runnerEnvironment(),
    hostManager: batchBrowserHosts,
    onEvent: (event: UnknownRecord) => {
      updateManager?.activityChanged();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('batch:event', event);
    },
    onNotify: ({ itemId, accountLabelMasked, type }: { itemId: string; accountLabelMasked: string; type: string }) => notificationManager.show({
      title: `${accountLabelMasked || '一个客户账号'}需要操作`,
      body: ({ login: '请完成账号登录', captcha: '请完成页面验证码', two_factor: '请完成二次验证' } as Record<string, string>)[type] || '请完成页面提示的操作',
      focus: { mode: 'batch', itemId },
    }),
  }) as CoordinatorLike;
  return batchCoordinator;
}

registerAutomationHandle('batch:store-demo-import', (_event: IpcInvokeEvent, rawPayload: unknown) => {
  const payload = asRecord(rawPayload);
  const rawRows = Array.isArray(payload.rows) ? payload.rows.slice(0, 100) : [];
  if (!rawRows.length) throw new Error('本地演示项为空');
  const importId = typeof payload.importId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(payload.importId)
    ? payload.importId
    : `demo_import_${Date.now()}`;
  return getBatchCoordinator().storeImport({
    importId,
    fileName: '本地交互演示数据',
    rows: rawRows.map((value, index) => {
      const row = asRecord(value);
      const itemId = typeof row.itemId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(row.itemId)
        ? row.itemId
        : `demo_item_${index + 1}`;
      const accountLabel = typeof row.accountLabel === 'string'
        ? row.accountLabel.slice(0, 80)
        : `演示项 ${index + 1}`;
      return {
        itemId,
        input: asRecord(row.input),
        preview: { account_label: accountLabel },
        accountLabelMasked: accountLabel,
      };
    }),
    errors: [],
  });
});

registerAutomationHandle('batch:select-import-file', async (_event: IpcInvokeEvent, rawOptions: unknown) => {
  const options = asRecord(rawOptions);
  const dialogOptions: import('electron').OpenDialogOptions = {
    title: '选择批量数据文件',
    properties: ['openFile'],
    filters: [{ name: '批量数据', extensions: ['xlsx', 'csv'] }],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || !result.filePaths[0]) return null;
  selectedBatchImportPath = result.filePaths[0];
  const parsed = await parseBatchFile(selectedBatchImportPath, options);
  return getBatchCoordinator().storeImport(parsed);
});
registerAutomationHandle('batch:parse-import-file', async (_event: IpcInvokeEvent, rawOptions: unknown) => {
  const options = asRecord(rawOptions);
  if (!selectedBatchImportPath) throw new Error('请先选择批量数据文件');
  const parsed = await parseBatchFile(selectedBatchImportPath, options);
  return getBatchCoordinator().storeImport(parsed);
});
registerAutomationHandle('batch:load-sample-import', async (_event: IpcInvokeEvent, rawOptions: unknown) => {
  const options = asRecord(rawOptions);
  const templatePath = app.isPackaged
    ? path.join(process.resourcesPath, 'templates', 'B端批量自动化测试数据.xlsx')
    : path.join(app.getAppPath(), 'resources', 'templates', 'B端批量自动化测试数据.xlsx');
  if (!fs.existsSync(templatePath)) throw new Error('内置测试 Excel 不存在，请更新桌面客户端');
  const parsed = await parseBatchFile(templatePath, options);
  return getBatchCoordinator().storeImport(parsed);
});
registerAutomationHandle('batch:save-sample-template', async () => {
  const templatePath = app.isPackaged
    ? path.join(process.resourcesPath, 'templates', 'B端批量自动化测试数据.xlsx')
    : path.join(app.getAppPath(), 'resources', 'templates', 'B端批量自动化测试数据.xlsx');
  if (!fs.existsSync(templatePath)) throw new Error('内置测试 Excel 不存在，请更新桌面客户端');
  const dialogOptions: import('electron').SaveDialogOptions = {
    title: '保存 B 端测试 Excel',
    defaultPath: 'B端批量自动化测试数据.xlsx',
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);
  if (result.canceled || !result.filePath) return null;
  fs.copyFileSync(templatePath, result.filePath);
  return { filePath: result.filePath };
});
registerAutomationHandle('batch:remap-import-items', (_event: IpcInvokeEvent, rawPayload: unknown) => {
  const payload = asRecord(rawPayload);
  const itemIds = Array.isArray(payload.itemIds) ? payload.itemIds.map(value => String(value || '')).filter(Boolean) : [];
  return getBatchCoordinator().remapImportItems(String(payload.importId || ''), itemIds);
});
registerAutomationHandle('batch:export-import-errors', async (_event: IpcInvokeEvent, rawErrors: unknown) => {
  const errors = Array.isArray(rawErrors) ? rawErrors : [];
  const dialogOptions: import('electron').SaveDialogOptions = {
    title: '导出导入问题',
    defaultPath: '批量导入问题.csv',
    filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);
  if (result.canceled || !result.filePath) return null;
  return writeBatchErrors(result.filePath, errors);
});
registerAutomationHandle('batch:create', (_event: IpcInvokeEvent, payload: unknown) => getBatchCoordinator().create(asRecord(payload)));
registerAutomationHandle('batch:start', (_event: IpcInvokeEvent, payload: unknown) => {
  const data = asRecord(payload);
  return getBatchCoordinator().startItem(String(data.itemId || ''), asRecord(data.tool));
});
registerAutomationHandle('batch:fail-item', (_event: IpcInvokeEvent, payload: unknown) => {
  const data = asRecord(payload);
  return getBatchCoordinator().failProvision(String(data.itemId || ''), typeof data.message === 'string' ? data.message : undefined);
});
registerAutomationHandle('batch:complete-user-action', (_event: IpcInvokeEvent, itemId: unknown) => getBatchCoordinator().completeUserAction(String(itemId || '')));
registerAutomationHandle('batch:restart-item', (_event: IpcInvokeEvent, itemId: unknown) => getBatchCoordinator().restartItem(String(itemId || '')));
registerAutomationHandle('batch:cancel', async (_event: IpcInvokeEvent, status: unknown) => {
  selectedBatchItemId = null;
  return getBatchCoordinator().cancel(typeof status === 'string' ? status : 'cancelled');
});
registerAutomationHandle('batch:get-snapshot', () => getBatchCoordinator().snapshot());
registerAutomationHandle('batch:select-item', (_event: IpcInvokeEvent, rawItemId: unknown) => {
  const itemId = String(rawItemId || '');
  selectedBatchItemId = itemId;
  return { itemId, snapshot: getBatchCoordinator().snapshot() };
});
registerAutomationHandle('batch:register-browser', (event: IpcInvokeEvent, rawItemId: unknown, webContentsId: unknown) => {
  const itemId = String(rawItemId || '');
  const guest = webContents.fromId(Number(webContentsId));
  if (!guest || guest.getType?.() !== 'webview') throw new Error('无法注册批量工作区浏览器');
  if (guest.hostWebContents && guest.hostWebContents.id !== event.sender.id) throw new Error('批量浏览器归属校验失败');
  return getBatchCoordinator().registerBrowser(itemId, guest);
});
registerAutomationHandle('batch:unregister-browser', (_event: IpcInvokeEvent, itemId: unknown) => getBatchCoordinator().unregisterBrowser(String(itemId || '')));

function defaultFreightWorkbookPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'rates', 'FreightTemplate_v2.xlsx')
    : path.join(app.getAppPath(), 'resources', 'rates', 'FreightTemplate_v2.xlsx');
}

async function loadDefaultFreightPack(): Promise<UnknownRecord> {
  const filePath = defaultFreightWorkbookPath();
  if (!fs.existsSync(filePath)) throw new Error('内置费率表不存在，请更新桌面客户端');
  const mtimeMs = fs.statSync(filePath).mtimeMs;
  const cached = defaultFreightPackCache;
  if (cached && cached.mtimeMs === mtimeMs) return cached.parsed;
  const parsed = await parseFreightWorkbook(filePath, { id: 'competition-freight', version: '1.0.0', exchangeRateCnyPerUsd: 7 });
  defaultFreightPackCache = { mtimeMs, parsed };
  return parsed;
}

registerAutomationHandle('freight:get-default-pack', () => loadDefaultFreightPack());
registerAutomationHandle('freight:parse-workbook', async (_event: IpcInvokeEvent, rawOptions: unknown) => {
  const options = asRecord(rawOptions);
  const dialogOptions: import('electron').OpenDialogOptions = {
    title: '选择物流费率工作簿',
    properties: ['openFile'],
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || !result.filePaths[0]) return null;
  selectedFreightWorkbookPath = result.filePaths[0];
  return parseFreightWorkbook(selectedFreightWorkbookPath, options);
});
registerAutomationHandle('freight:reparse-workbook', (_event: IpcInvokeEvent, rawOptions: unknown) => {
  if (!selectedFreightWorkbookPath) throw new Error('请先选择物流费率工作簿');
  return parseFreightWorkbook(selectedFreightWorkbookPath, asRecord(rawOptions));
});
registerAutomationHandle('freight:quote', async (_event: IpcInvokeEvent, rawPayload: unknown) => {
  const payload = asRecord(rawPayload);
  const parsed = payload.pack ? { pack: payload.pack } : await loadDefaultFreightPack();
  return quoteFreight(asRecord(parsed).pack, asRecord(payload.request));
});

async function cleanupAutomationRunner(): Promise<void> {
  embeddedBrowserHost.release();
  const cleanupTasks: Promise<unknown>[] = [];
  if (batchCoordinator) {
    selectedBatchItemId = null;
    const coordinator = batchCoordinator;
    cleanupTasks.push(coordinator.cancel('interrupted'));
  }
  batchBrowserHosts.releaseAll();
  if (automationRunner) {
    const runner = automationRunner;
    cleanupTasks.push(runner.stop());
  }
  if (!cleanupTasks.length) return;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>(resolve => { timeoutId = setTimeout(resolve, 5000); });
  const results = await Promise.race([Promise.allSettled(cleanupTasks), timeout]);
  if (timeoutId) clearTimeout(timeoutId);
  if (Array.isArray(results)) {
    const failures: unknown[] = [];
    for (const result of results) {
      if (result.status === 'rejected') {
        failures.push(result.reason);
        console.error('[Automation] 清理失败:', errorMessage(result.reason));
      }
    }
    if (failures.length) {
      const message = errorMessage(failures[0]);
      if (/timed?\s*out|timeout/i.test(message)) throw installBusyError(`Automation cleanup timed out: ${message}`);
      throw new Error(`Automation cleanup failed: ${message}`);
    }
  } else {
    throw installBusyError('Automation cleanup timed out');
  }
  batchCoordinator = null;
  automationRunner = null;
  singleRunActive = false;
}

async function quiesceApplication(): Promise<void> {
  await Promise.all([
    backendManager.cleanup(),
    cleanupAutomationRunner(),
  ]);
}

// ===== 后端进程管理 =====

function createWindow(): void {
  // 检测开发模式：环境变量或 dist 目录不存在
  const isDev = process.env.NODE_ENV === 'development' 
    || !require('fs').existsSync(path.join(__dirname, '../../dist'));
  
  const window: BrowserWindowType = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: AUTOMATION_RUNTIME_ENABLED,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [
        `--toolbox-control-api-base=${CONTROL_API_BASE}`,
        `--toolbox-device-id=${DEVICE_IDENTITY.deviceId}`,
        `--toolbox-device-name=${encodeURIComponent(DEVICE_IDENTITY.deviceName)}`,
        `--toolbox-automation-enabled=${AUTOMATION_RUNTIME_ENABLED ? 'true' : 'false'}`,
      ],
    },
    frame: true,
    show: false,
    backgroundColor: '#0F172A',
  });

  if (isDev) {
    // 开发模式：连接 Vite 开发服务器，支持热更新
    const startRoute = process.env.TOOLBOX_START_ROUTE === '/admin/login' ? '#/admin/login' : '';
    const developmentUrl = `http://localhost:3000/${startRoute}`;
    console.log(`[Dev] 连接 Vite 开发服务器 ${developmentUrl}`);
    void window.loadURL(developmentUrl);
    // 日常预览保持完整应用宽度；仅在显式调试时打开独立 DevTools。
    if (process.env.TOOLBOX_OPEN_DEVTOOLS === '1') {
      window.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    // 生产模式：通过安全自定义协议加载，避免主界面使用 file://。
    void window.loadURL('app://toolbox/index.html');
  }

  const allowDevelopmentOrigin = !app.isPackaged;
  const keepMainWindowOnApp = (event: import('electron').Event, url: string): void => {
    if (!isAllowedMainFrameUrl(url, allowDevelopmentOrigin)) event.preventDefault();
  };
  window.webContents.on('will-navigate', keepMainWindowOnApp);
  window.webContents.on('will-redirect', keepMainWindowOnApp);
  window.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    if (mayOpenExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (
      !AUTOMATION_RUNTIME_ENABLED
      || !isAllowedWebviewUrl(params.src || 'about:blank')
      || !isAllowedWebviewPartition(params.partition)
      || Boolean(params.preload)
    ) {
      event.preventDefault();
      return;
    }
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
  });

  // 页面加载完成后显示窗口（消除白屏闪烁）
  window.once('ready-to-show', () => {
    window.show();
  });

  // 将云端控制面地址注入渲染进程；旧 key 暂时保留以兼容已有版本。
  window.webContents.on('did-finish-load', () => {
    const apiBase = JSON.stringify(CONTROL_API_BASE);
    window.webContents.executeJavaScript(`
      localStorage.setItem('toolbox_control_api_base', ${apiBase});
      localStorage.setItem('toolbox_api_base', ${apiBase});
    `).catch(() => {});
  });
  mainWindow = window;

  window.on('closed', () => {
    demoActivityTokens.clear();
    updateManager?.activityChanged();
    if (mainWindow === window) mainWindow = null;
  });

  window.on('close', (event: import('electron').Event) => {
    const snapshot = batchCoordinator?.snapshot();
    const batchActive = snapshot?.status === 'running';
    const demoActive = demoActivityTokens.size > 0;
    if (allowWindowClose || (!batchActive && !singleRunActive && !demoActive)) return;
    event.preventDefault();
    dialog.showMessageBox(window, {
      type: 'warning',
      title: batchActive ? '结束当前批次？' : '结束当前操作？',
      message: batchActive
        ? '仍有账号正在处理或等待操作。关闭后浏览器现场会被清理，不能从通用检查点继续。'
        : '当前自动操作仍在进行。关闭后会安全停止本次操作。',
      buttons: ['继续使用', '结束并关闭'],
      defaultId: 0,
      cancelId: 0,
    }).then(async (result: import('electron').MessageBoxReturnValue) => {
      if (result.response !== 1) return;
      allowWindowClose = true;
      await batchCoordinator?.cancel('interrupted').catch(() => {});
      await automationRunner?.cancel().catch(() => {});
      singleRunActive = false;
      window.close();
    });
  });

}

app.whenReady().then(async () => {
  console.log('[INFO] App ready');
  credentialManager.register();

  // 检测开发模式
  const isDev = process.env.NODE_ENV === 'development' 
    || !require('fs').existsSync(path.join(__dirname, '../../dist'));

  // 仅兼容期的 localhost 配置启动旧 Python 后端；远程控制面模式不再携带服务端进程。
  if (USE_BUNDLED_BACKEND) {
    // 等待后端就绪再加载窗口，避免前端请求全部 ERR_CONNECTION_REFUSED
    const backendReady = await backendManager.ensure();
    if (!backendReady) {
      dialog.showErrorBox(
        '后端启动失败',
        `无法连接本地服务 ${CONTROL_API_BASE}。请查看 ${path.join(RUNTIME_ROOT, 'logs', 'backend-error.log')}。`,
      );
      app.quit();
      return;
    }
  } else {
    console.log('[Backend] 跳过内嵌后端，控制面:', CONTROL_API_BASE);
  }

  if (!isDev) registerAppProtocol(path.join(__dirname, '../../dist'));

  updateManager = new UpdateManager({
    ipcMain,
    getWindow: () => mainWindow,
    hasActiveWork: () => singleRunActive
      || batchCoordinator?.snapshot()?.status === 'running'
      || demoActivityTokens.size > 0,
    beforeInstall: async () => {
      await quiesceApplication();
      shutdownReady = true;
    },
  });
  // 创建窗口
  createWindow();
  if (app.isPackaged) setTimeout(() => updateManager?.check(), 5000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event: import('electron').Event) => {
  if (shutdownReady) {
    credentialManager.dispose();
    return;
  }
  event.preventDefault();
  if (updateManager?.shouldInstallOnQuit() && !updateManager.isInstalling()) {
    void updateManager.install();
    return;
  }
  if (!shutdownPromise) {
    shutdownPromise = quiesceApplication()
      .catch(error => console.error('[Shutdown] Cleanup failed:', errorMessage(error)))
      .finally(() => {
        shutdownReady = true;
        app.quit();
      });
  }
});
