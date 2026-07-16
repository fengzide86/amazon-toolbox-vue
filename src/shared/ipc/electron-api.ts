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

export interface BatchSnapshot {
  status?: 'running' | 'completed' | 'cancelled' | 'interrupted' | string
}

export interface BatchBridge {
  getSnapshot(): Promise<BatchSnapshot | null>
  cancel(status?: string): Promise<unknown>
}

export interface CredentialStoreBridge {
  saveUserCode(code: string): Promise<boolean>
  loadUserCode(): Promise<string | null>
  clearUserCode(): Promise<boolean>
}

export interface ToolboxElectronApi {
  runtime?: { controlApiBase?: string; deviceId?: string; deviceName?: string }
  updates?: UpdateBridge
  batch?: BatchBridge
  credentialStore?: CredentialStoreBridge
  [key: string]: unknown
}
