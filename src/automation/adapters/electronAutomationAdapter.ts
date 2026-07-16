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

export class ElectronAutomationAdapter implements AutomationAdapter {
  constructor(private readonly api: AutomationBridge) {}

  subscribe(listener: (event: AutomationEvent | unknown) => void): () => void {
    return this.api.onEvent(listener)
  }

  start(tool: AutomationTool): Promise<unknown> {
    return this.api.start(tool)
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

  dispose(): void {}
}
