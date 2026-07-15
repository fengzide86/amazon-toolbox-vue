import type { UpdateSnapshot } from './update-contract.js'

export interface UpdateBridge {
  getState(): Promise<UpdateSnapshot>
  check(): Promise<UpdateSnapshot>
  startDownload(): Promise<UpdateSnapshot>
  cancelDownload(): Promise<UpdateSnapshot>
  install(): Promise<UpdateSnapshot>
  defer(): Promise<UpdateSnapshot>
  onState(callback: (state: UpdateSnapshot) => void): () => void
}

export interface BatchSnapshot {
  status?: 'running' | 'completed' | 'cancelled' | 'interrupted' | string
}

export interface BatchBridge {
  getSnapshot(): Promise<BatchSnapshot | null>
  cancel(status?: string): Promise<unknown>
}

export interface ToolboxElectronApi {
  runtime?: { controlApiBase?: string; deviceId?: string; deviceName?: string }
  updates?: UpdateBridge
  batch?: BatchBridge
  [key: string]: unknown
}
