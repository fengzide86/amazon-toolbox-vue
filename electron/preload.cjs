const { contextBridge, ipcRenderer } = require('electron');
const crypto = require('crypto');
const os = require('os');

function readControlApiBase() {
  const prefix = '--toolbox-control-api-base=';
  const argument = process.argv.find(value => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length).replace(/\/$/, '') : '';
}

const controlApiBase = readControlApiBase();

// Expose only a hash of machine attributes, never the raw home directory.
function buildStableDeviceIdentity() {
  const source = [os.hostname(), os.homedir(), os.platform(), os.arch()].join('|');
  const digest = crypto.createHash('sha256').update(source).digest('hex').slice(0, 20).toUpperCase();
  return {
    deviceId: `DEV-${digest}`,
    deviceName: os.hostname() || 'Windows 设备',
  };
}

const stableDeviceIdentity = buildStableDeviceIdentity();

// 将 IPC 事件桥接到 window 事件，供 Vue 组件监听
ipcRenderer.on('update-download-progress', (event, data) => {
  window.dispatchEvent(new CustomEvent('update-download-progress', { detail: data }));
});

ipcRenderer.on('update-downloaded', (event, data) => {
  window.dispatchEvent(new CustomEvent('update-downloaded', { detail: data }));
});

ipcRenderer.on('update-available', (event, data) => {
  window.dispatchEvent(new CustomEvent('update-available', { detail: data }));
});

ipcRenderer.on('update-error', (event, data) => {
  window.dispatchEvent(new CustomEvent('update-error', { detail: data }));
});

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  runtime: {
    controlApiBase,
    deviceId: stableDeviceIdentity.deviceId,
    deviceName: stableDeviceIdentity.deviceName,
  },
  startDownloadUpdate: () => ipcRenderer.send('start-download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  pauseDownload: () => ipcRenderer.send('pause-download'),
  resumeDownload: () => ipcRenderer.send('resume-download'),
  cancelDownload: () => ipcRenderer.send('cancel-download'),
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (event, data) => callback(data));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, data) => callback(data));
  },
  // 普通用户授权码由主进程使用操作系统能力加密保存
  credentialStore: {
    saveUserCode: (code) => ipcRenderer.invoke('credential-save-user-code', code),
    loadUserCode: () => ipcRenderer.invoke('credential-load-user-code'),
    clearUserCode: () => ipcRenderer.invoke('credential-clear-user-code'),
  },
  automation: {
    start: (tool) => ipcRenderer.invoke('automation:start', tool),
    pause: () => ipcRenderer.invoke('automation:pause'),
    resume: () => ipcRenderer.invoke('automation:resume'),
    completeUserAction: () => ipcRenderer.invoke('automation:complete-user-action'),
    cancel: () => ipcRenderer.invoke('automation:cancel'),
    registerBrowser: (webContentsId) => ipcRenderer.invoke('automation:register-browser', webContentsId),
    unregisterBrowser: () => ipcRenderer.invoke('automation:unregister-browser'),
    onEvent: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('automation:event', listener);
      return () => ipcRenderer.removeListener('automation:event', listener);
    },
  },
  // 工具启动控制
  launchTool: (data) => ipcRenderer.send('launch-tool', data),
  onLaunchToolError: (callback) => {
    ipcRenderer.on('launch-tool-error', (event, data) => callback(data));
  },
  onLaunchToolSuccess: (callback) => {
    ipcRenderer.on('launch-tool-success', (event, data) => callback(data));
  },
  
  // 分屏模式：在系统浏览器中打开外部链接
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
