const { contextBridge, ipcRenderer } = require('electron');

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
  // 窗口形变控制：学员窄屏 / 管理员宽屏
  resizeWindow: (mode) => ipcRenderer.send('resize-window-context', mode),
  // 在系统默认浏览器中打开外部链接
  openExternal: (url) => ipcRenderer.send('open-external', url),
});
