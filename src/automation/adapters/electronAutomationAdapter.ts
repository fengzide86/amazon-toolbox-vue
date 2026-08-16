import type { AutomationBridge } from '@/shared/ipc/electron-api'
import type { AutomationEvent, AutomationTool } from '../events'

export type AutomationListener = (event: unknown) => void

export interface AutomationAdapter {
  subscribe(listener: AutomationListener): () => void
  start(tool: AutomationTool): unknown | Promise<unknown>
  pause(): unknown
  resume(): unknown
  completeUserAction(): unknown
  cancel(): unknown
  dispose(): void
}

function cloneForIpc<T>(value: T): T {
  const serialized = JSON.stringify(value)
  if (!serialized) throw new Error('自动化启动参数无法序列化')
  return JSON.parse(serialized) as T
}

export class ElectronAutomationAdapter implements AutomationAdapter {
  constructor(private readonly api: AutomationBridge) {}

  subscribe(listener: (event: AutomationEvent | unknown) => void): () => void {
    return this.api.onEvent(listener)
  }

  start(tool: AutomationTool): Promise<unknown> {
    // Pinia stores expose nested Vue proxies. Electron's structured-clone
    // boundary rejects those proxies, even though their data is JSON-safe.
    return this.api.start(cloneForIpc(tool))
  }

  pause(): Promise<unknown> {
    return this.api.pause()
  }

  resume(): Promise<unknown> {
    return this.api.resume()
  }

  completeUserAction(): Promise<unknown> {
    return this.api.completeUserAction()
  }

  cancel(): Promise<unknown> {
    return this.api.cancel()
  }

  dispose(): void { void this.api.cancel() }
}
