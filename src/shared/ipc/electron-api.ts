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

export interface ToolboxElectronApi {
  runtime?: { controlApiBase?: string; deviceId?: string; deviceName?: string }
  updates?: UpdateBridge
  [key: string]: unknown
}
