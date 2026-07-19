import type { AutomationAdapter } from './adapters/electronAutomationAdapter'
import { ElectronAutomationAdapter } from './adapters/electronAutomationAdapter'
import { DemoAutomationAdapter, type MockAutomationOptions } from './adapters/mockAutomationAdapter'

export * from './events'
export { DemoAutomationAdapter, MockAutomationAdapter, createMockSteps } from './adapters/mockAutomationAdapter'
export { ElectronAutomationAdapter } from './adapters/electronAutomationAdapter'
export type { AutomationAdapter } from './adapters/electronAutomationAdapter'

export interface AutomationAdapterOptions {
  mode: 'demo' | 'live'
  adapter?: AutomationAdapter
  mock?: MockAutomationOptions
}

export function createAutomationAdapter(options: AutomationAdapterOptions): AutomationAdapter {
  if (options.adapter) return options.adapter
  if (options.mode === 'demo') return new DemoAutomationAdapter(options.mock)
  const api = typeof window !== 'undefined' ? window.electronAPI?.automation : undefined
  if (!api) throw new Error('LIVE_RUNTIME_UNAVAILABLE: 真实工具仅支持桌面客户端')
  return new ElectronAutomationAdapter(api)
}
