const { contextBridge, ipcRenderer } = require('electron');

function readRuntimeArgument(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find(value => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : '';
}

const controlApiBase = readRuntimeArgument('toolbox-control-api-base').replace(/\/$/, '');
const deviceId = readRuntimeArgument('toolbox-device-id');
const deviceName = decodeURIComponent(readRuntimeArgument('toolbox-device-name'));

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  runtime: {
    controlApiBase,
    deviceId,
    deviceName,
  },
  updates: {
    getState: () => ipcRenderer.invoke('updates:get-state'),
    check: () => ipcRenderer.invoke('updates:check'),
    startDownload: () => ipcRenderer.invoke('updates:start-download'),
    cancelDownload: () => ipcRenderer.invoke('updates:cancel-download'),
    install: () => ipcRenderer.invoke('updates:install'),
    defer: () => ipcRenderer.invoke('updates:defer'),
    onState: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('updates:state', listener);
      return () => ipcRenderer.removeListener('updates:state', listener);
    },
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
  batch: {
    selectImportFile: (options) => ipcRenderer.invoke('batch:select-import-file', options),
    parseImportFile: (options) => ipcRenderer.invoke('batch:parse-import-file', options),
    exportImportErrors: (errors) => ipcRenderer.invoke('batch:export-import-errors', errors),
    create: (payload) => ipcRenderer.invoke('batch:create', payload),
    start: (payload) => ipcRenderer.invoke('batch:start', payload),
    failItem: (payload) => ipcRenderer.invoke('batch:fail-item', payload),
    selectItem: (itemId) => ipcRenderer.invoke('batch:select-item', itemId),
    completeUserAction: (itemId) => ipcRenderer.invoke('batch:complete-user-action', itemId),
    restartItem: (itemId) => ipcRenderer.invoke('batch:restart-item', itemId),
    cancel: (status) => ipcRenderer.invoke('batch:cancel', status),
    getSnapshot: () => ipcRenderer.invoke('batch:get-snapshot'),
    registerBrowser: (itemId, webContentsId) => ipcRenderer.invoke('batch:register-browser', itemId, webContentsId),
    unregisterBrowser: (itemId) => ipcRenderer.invoke('batch:unregister-browser', itemId),
    onEvent: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('batch:event', listener);
      return () => ipcRenderer.removeListener('batch:event', listener);
    },
  },
  notifications: {
    onFocus: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('toolbox:notification-focus', listener);
      return () => ipcRenderer.removeListener('toolbox:notification-focus', listener);
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
