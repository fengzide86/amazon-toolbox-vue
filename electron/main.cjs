const { app, BrowserWindow, dialog, ipcMain, safeStorage, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const { RunnerClient } = require('./automation/runner-client.cjs');
const { EmbeddedBrowserHost } = require('./automation/embedded-browser-host.cjs');
const toolSigningConfig = require('./tool-signing-config.cjs');

let mainWindow;
let backendProcess = null;
let automationRunner = null;
const embeddedBrowserHost = new EmbeddedBrowserHost();

// Keep customer runtime data off the system drive by default. The environment
// override remains available for deployments that need a different location.
function configureRuntimeRoot() {
  const preferredRoot = process.env.TOOLBOX_RUNTIME_DIR || 'D:\\AmazonToolboxData';
  try {
    fs.mkdirSync(preferredRoot, { recursive: true });
    app.setPath('userData', preferredRoot);
    app.setPath('sessionData', path.join(preferredRoot, 'session-data'));
    return preferredRoot;
  } catch (error) {
    console.warn('[Runtime] Unable to use preferred data directory:', error.message);
    return app.getPath('userData');
  }
}

const RUNTIME_ROOT = configureRuntimeRoot();

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

// ===== 自动更新功能 =====
// 更新服务器地址（优先从环境变量读取，默认值仅供开发使用）
const UPDATE_SERVER_URL = process.env.ELECTRON_UPDATE_URL || 'http://8.130.113.104:8000/updates/';
// 云端控制面地址。配置为远程 HTTPS 后，桌面端不会再启动打包的 Python 后端。
const CONTROL_API_BASE = (process.env.TOOLBOX_CONTROL_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const USE_BUNDLED_BACKEND = process.env.TOOLBOX_USE_BUNDLED_BACKEND
  ? process.env.TOOLBOX_USE_BUNDLED_BACKEND === 'true'
  : CONTROL_API_BASE === 'http://localhost:8000';

// 配置自动更新
autoUpdater.autoDownload = false; // 不自动下载，先通知用户
autoUpdater.autoInstallOnAppQuit = true; // 退出时自动安装

// 配置更新源（必须设置，否则无法检测更新）
autoUpdater.setFeedURL({
  provider: 'generic',
  url: UPDATE_SERVER_URL
});

// 检查更新
function checkForUpdates() {
  console.log('[Updater] 检查更新中...');
  autoUpdater.checkForUpdates().catch(err => {
    console.log('[Updater] 检查更新失败:', err.message);
  });
}

// 更新可用时通知用户
autoUpdater.on('update-available', (info) => {
  console.log('[Updater] 发现新版本:', info.version);
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，是否立即更新？`,
      buttons: ['稍后再说', '立即更新'],
      defaultId: 1,
      cancelId: 0
    }).then(result => {
      if (result.response === 1) {
        // 用户点击"立即更新"，开始下载
        console.log('[Updater] 用户选择立即更新，开始下载...');
        autoUpdater.downloadUpdate().catch(err => {
          console.error('[Updater] 下载失败:', err.message);
          if (mainWindow) {
            dialog.showMessageBox(mainWindow, {
              type: 'error',
              title: '更新下载失败',
              message: '无法下载更新文件，请检查网络连接后重试。\n\n错误信息：' + err.message,
              buttons: ['确定']
            });
          }
        });
      } else {
        console.log('[Updater] 用户选择稍后再说');
      }
    }).catch(err => {
      console.error('[Updater] 显示对话框失败:', err.message);
    });
  }
});

// 更新不可用时
autoUpdater.on('update-not-available', (info) => {
  console.log('[Updater] 当前已是最新版本');
});

// 下载进度
autoUpdater.on('download-progress', (progressObj) => {
  const percent = Math.round(progressObj.percent);
  const speed = (progressObj.bytesPerSecond / 1024 / 1024).toFixed(2);
  const transferred = (progressObj.transferred.total / 1024 / 1024).toFixed(1);
  const total = (progressObj.total / 1024 / 1024).toFixed(1);
  console.log('[Updater] 下载进度:', percent + '%');
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', {
      percent,
      speed,
      transferred,
      total
    });
  }
});

// 下载完成
autoUpdater.on('update-downloaded', (info) => {
  console.log('[Updater] 下载完成，准备安装');
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新已就绪',
      message: '新版本已下载完成，是否立即重启安装？',
      buttons: ['稍后重启', '立即重启'],
      defaultId: 1,
      cancelId: 0
    }).then(result => {
      if (result.response === 1) {
        // 用户点击"立即重启"，安装更新
        console.log('[Updater] 用户选择立即重启，安装更新...');
        autoUpdater.quitAndInstall();
      } else {
        console.log('[Updater] 用户选择稍后重启，将在退出时自动安装');
      }
    }).catch(err => {
      console.error('[Updater] 显示对话框失败:', err.message);
    });
  }
});

// 更新错误 - 通知用户
autoUpdater.on('error', (err) => {
  console.error('[Updater] 更新错误:', err.message);
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: '更新失败',
      message: '检查或下载更新时出错，请稍后重试。\n\n错误信息：' + err.message,
      buttons: ['确定']
    });
  }
});

// 监听来自渲染进程的更新指令
ipcMain.on('start-download-update', () => {
  console.log('[Updater] 开始下载更新...');
  autoUpdater.downloadUpdate().catch(err => {
    console.error('[Updater] 下载失败:', err.message);
  });
});

ipcMain.on('install-update', () => {
  console.log('[Updater] 安装更新，即将重启...');
  cleanupBackend();
  cleanupAutomationRunner();
  autoUpdater.quitAndInstall();
});

// 暂停/继续下载
ipcMain.on('pause-download', () => {
  console.log('[Updater] 暂停下载');
  autoUpdater.autoDownload = false;
});

ipcMain.on('resume-download', () => {
  console.log('[Updater] 继续下载');
  autoUpdater.autoDownload = true;
  autoUpdater.downloadUpdate().catch(err => {
    console.error('[Updater] 继续下载失败:', err.message);
  });
});

ipcMain.on('cancel-download', () => {
  console.log('[Updater] 取消下载');
  // electron-updater 不支持直接取消，重新设置 feed URL 来重置
});

// ===== 分屏模式：在系统浏览器中打开外部链接 =====
ipcMain.handle('open-external', async (event, url) => {
  const { shell } = require('electron');
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
    return { success: true };
  }
  return { success: false, message: '无效的 URL' };
});

// ===== 工具启动控制（内部 IPC 直通处理） =====
ipcMain.on('launch-tool', async (event, data) => {
  const { shell, net } = require('electron');
  const launchData = data.launchData || {};
  const toolName = data.toolName || '未知工具';
  
  console.log('[LaunchTool] 启动工具:', toolName, 'toolId:', launchData.tool_id);
  
  // 兼容旧的 launchUrl 模式
  if (!launchData.token && data.launchUrl) {
    const launchUrl = data.launchUrl;
    if (launchUrl.startsWith('http://') || launchUrl.startsWith('https://')) {
      shell.openExternal(launchUrl);
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
    const verifyUrl = `${CONTROL_API_BASE}/api/tools/launch-grant/verify?token=${encodeURIComponent(launchData.token)}`;
    
    const request = net.request({ method: 'POST', url: verifyUrl });
    
    request.on('response', (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          const result = JSON.parse(body);
          
          if (result.success && result.data && result.data.valid) {
            console.log('[LaunchTool] Token 验证通过');
            event.sender.send('launch-tool-success', { 
              toolName,
              platformKey: launchData.platform_key,
            });
          } else {
            const errMsg = result.message || 'Token 验证失败';
            console.error('[LaunchTool] Token 验证失败:', errMsg);
            event.sender.send('launch-tool-error', { message: errMsg });
          }
        } catch (parseErr) {
          console.error('[LaunchTool] 解析验证响应失败:', parseErr.message);
          event.sender.send('launch-tool-error', { message: '工具启动验证失败' });
        }
      });
    });
    
    request.on('error', (err) => {
      console.error('[LaunchTool] 验证请求失败:', err.message);
      event.sender.send('launch-tool-error', { message: '网络连接失败，请检查后端服务' });
    });
    
    request.end();
  } catch (err) {
    console.error('[LaunchTool] 启动工具异常:', err.message);
    event.sender.send('launch-tool-error', { message: '工具启动失败: ' + err.message });
  }
});

// ===== 安全凭据存储 =====
function credentialFilePath() {
  return path.join(app.getPath('userData'), 'user-credential.bin');
}

ipcMain.handle('credential-save-user-code', async (_event, code) => {
  if (typeof code !== 'string' || !code.trim() || !safeStorage.isEncryptionAvailable()) {
    return false;
  }
  const target = credentialFilePath();
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, safeStorage.encryptString(code.trim()));
  if (fs.existsSync(target)) fs.unlinkSync(target);
  fs.renameSync(temp, target);
  return true;
});

// ===== 本地 Node Automation Runner =====
function getAutomationRunner() {
  if (automationRunner) return automationRunner;
  automationRunner = new RunnerClient({
    scriptPath: path.join(__dirname, 'automation-runner.cjs'),
    env: {
      TOOLBOX_CONTROL_API_URL: CONTROL_API_BASE,
      TOOLBOX_PROFILE_ROOT: path.join(app.getPath('userData'), 'automation-profiles'),
      TOOLBOX_ARTIFACT_ROOT: path.join(app.getPath('userData'), 'automation-artifacts'),
      PLAYWRIGHT_BROWSERS_PATH: path.join(RUNTIME_ROOT, 'playwright-browsers'),
      TOOLBOX_TOOL_SIGNING_PUBLIC_KEY_B64: process.env.TOOLBOX_TOOL_SIGNING_PUBLIC_KEY_B64 || toolSigningConfig.publicKeyB64,
    },
    onEvent: event => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('automation:event', event);
      }
    },
    onHostRequest: (action, payload) => embeddedBrowserHost.request(action, payload),
  });
  return automationRunner;
}

ipcMain.handle('automation:start', async (_event, tool) => {
  if (!tool || typeof tool !== 'object' || !tool.id) throw new Error('工具启动数据不完整');
  return getAutomationRunner().start({
    ...tool,
    browserMode: embeddedBrowserHost.isReady() ? 'embedded-cdp' : 'playwright',
  });
});
ipcMain.handle('automation:pause', () => getAutomationRunner().pause());
ipcMain.handle('automation:resume', () => getAutomationRunner().resume());
ipcMain.handle('automation:cancel', () => getAutomationRunner().cancel());
ipcMain.handle('automation:register-browser', (event, webContentsId) => {
  const guest = webContents.fromId(Number(webContentsId));
  if (!guest || guest.getType?.() !== 'webview') throw new Error('无法注册工作区浏览器');
  if (guest.hostWebContents && guest.hostWebContents.id !== event.sender.id) {
    throw new Error('工作区浏览器归属校验失败');
  }
  return embeddedBrowserHost.register(guest);
});
ipcMain.handle('automation:unregister-browser', () => embeddedBrowserHost.release());

function cleanupAutomationRunner() {
  embeddedBrowserHost.release();
  if (!automationRunner) return;
  const runner = automationRunner;
  automationRunner = null;
  runner.stop().catch(error => console.error('[AutomationRunner] 关闭失败:', error.message));
}

ipcMain.handle('credential-load-user-code', async () => {
  try {
    const target = credentialFilePath();
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(target)) return null;
    return safeStorage.decryptString(fs.readFileSync(target));
  } catch (err) {
    console.error('[CredentialStore] 读取凭据失败:', err.message);
    return null;
  }
});

ipcMain.handle('credential-clear-user-code', async () => {
  try {
    const target = credentialFilePath();
    if (fs.existsSync(target)) fs.unlinkSync(target);
    return true;
  } catch (err) {
    console.error('[CredentialStore] 清理凭据失败:', err.message);
    return false;
  }
});

// ===== 后端进程管理 =====

// 等待后端就绪（轮询健康检查接口）
function waitForBackend(maxWaitMs = 15000) {
  const http = require('http');
  const startTime = Date.now();
  const pollInterval = 500; // 每 500ms 检查一次

  return new Promise((resolve) => {
    function poll() {
      const elapsed = Date.now() - startTime;
      if (elapsed > maxWaitMs) {
        console.log('[Backend] 健康检查超时（' + maxWaitMs + 'ms），继续加载窗口');
        resolve(false);
        return;
      }

      const req = http.get('http://localhost:8000/api/health', (res) => {
        if (res.statusCode === 200) {
          console.log('[Backend] 健康检查通过，后端已就绪 (' + elapsed + 'ms)');
          resolve(true);
        } else {
          setTimeout(poll, pollInterval);
        }
        res.resume(); // 消费响应数据，避免内存泄漏
      });
      req.on('error', () => {
        // 连接被拒绝 = 后端还没启动好，继续等
        setTimeout(poll, pollInterval);
      });
      req.setTimeout(1000, () => {
        req.destroy();
        setTimeout(poll, pollInterval);
      });
    }
    poll();
  });
}

function checkBackendHealth(timeoutMs = 1200) {
  const http = require('http');
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const request = http.get('http://localhost:8000/api/health', response => {
      response.resume();
      finish(response.statusCode === 200);
    });
    request.once('error', () => finish(false));
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      finish(false);
    });
  });
}

async function ensureBackend() {
  if (await checkBackendHealth()) {
    console.log('[Backend] Reusing healthy service on localhost:8000');
    return true;
  }
  startBackend();
  return waitForBackend(15000);
}

function startBackend() {
  // 打包后 exe 在 resources/ 目录（由 extraResources 提取），开发模式不走此路径
  const backendExe = path.join(process.resourcesPath, 'toolbox-backend.exe');
  const fs = require('fs');

  if (!fs.existsSync(backendExe)) {
    console.error('[Backend] 后端 exe 不存在:', backendExe);
    return;
  }

  // 将后端错误日志写到用户可访问的位置，方便排查
  const logDir = path.join(RUNTIME_ROOT, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'backend-error.log');
  let logStream;
  try {
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
  } catch (e) {
    console.error('[Backend] 无法创建日志文件:', e.message);
  }

  try {
    backendProcess = spawn(backendExe, [], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        TOOLBOX_RUNTIME_DIR: RUNTIME_ROOT,
        APPDATA: RUNTIME_ROOT,
      },
    });
    console.log('[Backend] 后端进程已启动, PID:', backendProcess.pid);
    console.log('[Backend] exe 路径:', backendExe);
    console.log('[Backend] 错误日志:', logPath);

    // 捕获 stderr 写入日志文件
    if (backendProcess.stderr && logStream) {
      backendProcess.stderr.pipe(logStream);
    }
    if (backendProcess.stdout && logStream) {
      backendProcess.stdout.pipe(logStream);
    }

    backendProcess.on('error', (err) => {
      console.error('[Backend] 后端启动失败:', err.message);
      if (logStream) {
        logStream.write('\n[ERROR] ' + new Date().toISOString() + ' ' + err.message + '\n');
      }
    });
    backendProcess.on('exit', (code) => {
      console.log('[Backend] 后端进程退出, code:', code);
      if (logStream && code !== 0) {
        logStream.write('\n[EXIT] ' + new Date().toISOString() + ' exit code: ' + code + '\n');
      }
      backendProcess = null;
    });
  } catch (err) {
    console.error('[Backend] 启动后端失败:', err.message);
    if (logStream) {
      logStream.write('\n[EXCEPTION] ' + new Date().toISOString() + ' ' + err.message + '\n');
    }
  }
}

function cleanupBackend() {
  if (backendProcess) {
    console.log('[Backend] 正在关闭后端进程...');
    try {
      backendProcess.kill('SIGTERM');
      // 给后端 3 秒时间优雅关闭
      setTimeout(() => {
        if (backendProcess) {
          backendProcess.kill('SIGKILL');
          backendProcess = null;
        }
      }, 3000);
    } catch (err) {
      console.error('[Backend] 关闭后端失败:', err.message);
      backendProcess = null;
    }
  }
}

function createWindow() {
  // 检测开发模式：环境变量或 dist 目录不存在
  const isDev = process.env.NODE_ENV === 'development' 
    || !require('fs').existsSync(path.join(__dirname, '../dist'));
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [`--toolbox-control-api-base=${CONTROL_API_BASE}`],
    },
    frame: true,
    show: false,
    backgroundColor: '#0F172A',
  });

  if (isDev) {
    // 开发模式：连接 Vite 开发服务器，支持热更新
    console.log('[Dev] 连接 Vite 开发服务器 http://localhost:3000');
    mainWindow.loadURL('http://localhost:3000');
    // 开发模式打开 DevTools
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式：加载打包后的静态文件
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 页面加载完成后显示窗口（消除白屏闪烁）
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 将云端控制面地址注入渲染进程；旧 key 暂时保留以兼容已有版本。
  mainWindow.webContents.on('did-finish-load', () => {
    const apiBase = JSON.stringify(CONTROL_API_BASE);
    mainWindow.webContents.executeJavaScript(`
      localStorage.setItem('toolbox_control_api_base', ${apiBase});
      localStorage.setItem('toolbox_api_base', ${apiBase});
    `).catch(() => {});
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 应用启动后 5 秒检查更新
  setTimeout(checkForUpdates, 5000);
}

app.whenReady().then(async () => {
  console.log('[INFO] App ready');

  // 检测开发模式
  const isDev = process.env.NODE_ENV === 'development' 
    || !require('fs').existsSync(path.join(__dirname, '../dist'));

  // 仅兼容期的 localhost 配置启动旧 Python 后端；远程控制面模式不再携带服务端进程。
  if (!isDev && USE_BUNDLED_BACKEND) {
    // 等待后端就绪再加载窗口，避免前端请求全部 ERR_CONNECTION_REFUSED
    await ensureBackend();
  } else {
    console.log('[Backend] 跳过内嵌后端，控制面:', CONTROL_API_BASE);
  }

  // 创建窗口
  createWindow();
});

app.on('window-all-closed', () => {
  cleanupBackend();
  cleanupAutomationRunner();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  cleanupBackend();
  cleanupAutomationRunner();
});
