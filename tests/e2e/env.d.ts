import type { ToolboxElectronApi } from '../../src/shared/ipc/electron-api'

declare global {
  interface Window {
    electronAPI?: ToolboxElectronApi
    __routeTrackObserved?: boolean
  }
}

export {}
