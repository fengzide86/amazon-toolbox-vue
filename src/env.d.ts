/// <reference types="vite/client" />

import type { ToolboxElectronApi } from '@/shared/ipc/electron-api'

declare global {
  interface Window {
    electronAPI?: ToolboxElectronApi
  }
}

export {}
