import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { UpdateDeferPhase, UpdateSnapshot } from '../src/shared/ipc/update-contract.js'

type Unsubscribe = () => void
type UnknownCallback = (data: unknown) => void

function readRuntimeArgument(name: string): string {
  const prefix = `--${name}=`
  const argument = process.argv.find(value => value.startsWith(prefix))
  return argument ? argument.slice(prefix.length) : ''
}

function subscribe(channel: string, callback: UnknownCallback): Unsubscribe {
  const listener = (_event: IpcRendererEvent, data: unknown): void => callback(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const controlApiBase = readRuntimeArgument('toolbox-control-api-base').replace(/\/$/, '')
const deviceId = readRuntimeArgument('toolbox-device-id')
const deviceName = decodeURIComponent(readRuntimeArgument('toolbox-device-name'))
const automationEnabled = readRuntimeArgument('toolbox-automation-enabled') === 'true'

contextBridge.exposeInMainWorld('electronAPI', {
  runtime: { controlApiBase, deviceId, deviceName },
  updates: {
    getState: (): Promise<UpdateSnapshot> => ipcRenderer.invoke('updates:get-state'),
    check: (): Promise<UpdateSnapshot> => ipcRenderer.invoke('updates:check'),
    startDownload: (): Promise<UpdateSnapshot> => ipcRenderer.invoke('updates:start-download'),
    cancelDownload: (): Promise<UpdateSnapshot> => ipcRenderer.invoke('updates:cancel-download'),
    install: (): Promise<UpdateSnapshot> => ipcRenderer.invoke('updates:install'),
    defer: (request?: { phase: UpdateDeferPhase }): Promise<UpdateSnapshot> => ipcRenderer.invoke('updates:defer', request),
    onState: (callback: (snapshot: UpdateSnapshot) => void): Unsubscribe => subscribe('updates:state', data => callback(data as UpdateSnapshot)),
  },
  demoActivity: {
    setActive: (token: string, active: boolean): Promise<void> => ipcRenderer.invoke('demo-activity:set-active', token, active),
  },
  credentialStore: {
    saveUserCode: (code: string): Promise<unknown> => ipcRenderer.invoke('credential-save-user-code', code),
    loadUserCode: (): Promise<unknown> => ipcRenderer.invoke('credential-load-user-code'),
    clearUserCode: (): Promise<unknown> => ipcRenderer.invoke('credential-clear-user-code'),
  },
  ...(automationEnabled ? { automation: {
    start: (tool: unknown): Promise<unknown> => ipcRenderer.invoke('automation:start', tool),
    pause: (): Promise<unknown> => ipcRenderer.invoke('automation:pause'),
    resume: (): Promise<unknown> => ipcRenderer.invoke('automation:resume'),
    completeUserAction: (): Promise<unknown> => ipcRenderer.invoke('automation:complete-user-action'),
    cancel: (): Promise<unknown> => ipcRenderer.invoke('automation:cancel'),
    registerBrowser: (webContentsId: number): Promise<unknown> => ipcRenderer.invoke('automation:register-browser', webContentsId),
    unregisterBrowser: (): Promise<unknown> => ipcRenderer.invoke('automation:unregister-browser'),
    onEvent: (callback: UnknownCallback): Unsubscribe => subscribe('automation:event', callback),
  }, batch: {
    selectImportFile: (options: unknown): Promise<unknown> => ipcRenderer.invoke('batch:select-import-file', options),
    parseImportFile: (options: unknown): Promise<unknown> => ipcRenderer.invoke('batch:parse-import-file', options),
    exportImportErrors: (errors: unknown): Promise<unknown> => ipcRenderer.invoke('batch:export-import-errors', errors),
    create: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('batch:create', payload),
    start: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('batch:start', payload),
    failItem: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('batch:fail-item', payload),
    selectItem: (itemId: string): Promise<unknown> => ipcRenderer.invoke('batch:select-item', itemId),
    completeUserAction: (itemId: string): Promise<unknown> => ipcRenderer.invoke('batch:complete-user-action', itemId),
    restartItem: (itemId: string): Promise<unknown> => ipcRenderer.invoke('batch:restart-item', itemId),
    cancel: (status?: string): Promise<unknown> => ipcRenderer.invoke('batch:cancel', status),
    getSnapshot: (): Promise<unknown> => ipcRenderer.invoke('batch:get-snapshot'),
    registerBrowser: (itemId: string, webContentsId: number): Promise<unknown> => ipcRenderer.invoke('batch:register-browser', itemId, webContentsId),
    unregisterBrowser: (itemId: string): Promise<unknown> => ipcRenderer.invoke('batch:unregister-browser', itemId),
    onEvent: (callback: UnknownCallback): Unsubscribe => subscribe('batch:event', callback),
  },
  launchTool: (data: unknown): void => ipcRenderer.send('launch-tool', data),
  onLaunchToolError: (callback: UnknownCallback): Unsubscribe => subscribe('launch-tool-error', callback),
  onLaunchToolSuccess: (callback: UnknownCallback): Unsubscribe => subscribe('launch-tool-success', callback),
  } : {}),
  notifications: { onFocus: (callback: UnknownCallback): Unsubscribe => subscribe('toolbox:notification-focus', callback) },
  openExternal: (url: string): Promise<unknown> => ipcRenderer.invoke('open-external', url),
})
