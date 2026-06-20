const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

// ===== 自动更新功能 =====
// 更新服务器地址（优先从环境变量读取，默认值仅供开发使用）
const UPDATE_SERVER_URL = process.env.ELECTRON_UPDATE_URL || 'http://8.130.113.104:8000/updates/';

// 云端服务器地址（优先从环境变量读取，默认值仅供开发使用）
const CLOUD_API_BASE = process.env.ELECTRON_API_BASE || 'http://8.130.113.104:8000';

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

// 更新错误
autoUpdater.on('error', (err) => {
  console.error('[Updater] 更新错误:', err.message);
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
  autoUpdater.quitAndInstall();
});

// ===== 窗口形变控制 =====
ipcMain.on('resize-window-context', (event, targetMode) => {
  if (!mainWindow) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: scrWidth, height: scrHeight } = primaryDisplay.workAreaSize;

  if (targetMode === 'trainee-mini') {
    // 学员窄屏伴侣：420px 宽，贴右，强制置顶
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(380, 600);
    mainWindow.setBounds({
      x: scrWidth - 420,
      y: 0,
      width: 420,
      height: scrHeight
    }, true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  } else if (targetMode === 'admin-large') {
    // 管理员宽屏看板：1200x800 居中，取消置顶
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(900, 600);
    mainWindow.setBounds({
      x: Math.floor((scrWidth - 1200) / 2),
      y: Math.floor((scrHeight - 800) / 2),
      width: 1200,
      height: 800
    }, true);
  } else if (targetMode === 'reset') {
    // 重置为默认窗口
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setMinimumSize(900, 600);
    mainWindow.setBounds({
      x: Math.floor((scrWidth - 1280) / 2),
      y: Math.floor((scrHeight - 800) / 2),
      width: 1280,
      height: 800
    }, true);
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 380,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    frame: true,
    show: true,
  });

  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  // 设置云端服务器地址到 localStorage
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      localStorage.setItem('toolbox_api_base', '${CLOUD_API_BASE}');
    `).catch(() => {});
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 应用启动后 5 秒检查更新
  setTimeout(checkForUpdates, 5000);
}

// 绕过系统代理，直连服务器（不受 Clash/VPN 等代理软件影响）
app.commandLine.appendSwitch('no-proxy-server');

app.whenReady().then(() => {
  console.log('[INFO] App ready');

  // 创建窗口，直接连接云端服务器
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});