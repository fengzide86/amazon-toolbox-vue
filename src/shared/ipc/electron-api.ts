import type { UpdateDeferPhase, UpdateSnapshot } from './update-contract.js'

export interface UpdateBridge {
  getState(): Promise<UpdateSnapshot>
  check(): Promise<UpdateSnapshot>
  startDownload(): Promise<UpdateSnapshot>
  cancelDownload(): Promise<UpdateSnapshot>
  install(): Promise<UpdateSnapshot>
  defer(request?: { phase: UpdateDeferPhase }): Promise<UpdateSnapshot>
  onState(callback: (state: UpdateSnapshot) => void): () => void
}

export interface DemoActivityBridge {
  setActive(token: string, active: boolean): Promise<void>
}

export interface BatchSnapshot {
  status?: 'running' | 'completed' | 'cancelled' | 'interrupted' | string
}

export interface BatchBridge {
  storeDemoImport(payload: unknown): Promise<unknown>
  loadSampleImport(options: unknown): Promise<unknown>
  saveSampleTemplate(): Promise<unknown>
  remapImportItems(payload: unknown): Promise<unknown>
  selectImportFile(options: unknown): Promise<unknown>
  parseImportFile(options: unknown): Promise<unknown>
  exportImportErrors(errors: unknown): Promise<unknown>
  create(payload: unknown): Promise<unknown>
  start(payload: unknown): Promise<unknown>
  failItem(payload: unknown): Promise<unknown>
  selectItem(itemId: string): Promise<unknown>
  completeUserAction(itemId: string): Promise<unknown>
  restartItem(itemId: string): Promise<unknown>
  cancel(status?: string): Promise<unknown>
  getSnapshot(): Promise<BatchSnapshot | null>
  registerBrowser(itemId: string, webContentsId: number): Promise<unknown>
  unregisterBrowser(itemId: string): Promise<unknown>
  onEvent(callback: (event: unknown) => void): () => void
}

export interface AutomationBridge {
  start(tool: unknown): Promise<unknown>
  pause(): Promise<unknown>
  resume(): Promise<unknown>
  completeUserAction(): Promise<unknown>
  cancel(): Promise<unknown>
  registerBrowser(webContentsId: number): Promise<unknown>
  unregisterBrowser(): Promise<unknown>
  onEvent(callback: (event: unknown) => void): () => void
}

export interface CredentialStoreBridge {
  saveUserCode(code: string): Promise<boolean>
  loadUserCode(): Promise<string | null>
  clearUserCode(): Promise<boolean>
}

export interface FreightBridge {
  getDefaultPack(): Promise<unknown>
  parseWorkbook(options: unknown): Promise<unknown>
  reparseWorkbook(options: unknown): Promise<unknown>
  quote(payload: unknown): Promise<unknown>
}

export interface NotificationFocusPayload {
  mode?: 'single' | 'batch'
  itemId?: string
}

export interface NotificationBridge {
  onFocus(callback: (payload: NotificationFocusPayload) => void): () => void
}

export interface ToolboxElectronApi {
  runtime?: { controlApiBase?: string; deviceId?: string; deviceName?: string }
  updates?: UpdateBridge
  demoActivity?: DemoActivityBridge
  batch?: BatchBridge
  automation?: AutomationBridge
  credentialStore?: CredentialStoreBridge
  notifications?: NotificationBridge
  freight?: FreightBridge
  [key: string]: unknown
}
