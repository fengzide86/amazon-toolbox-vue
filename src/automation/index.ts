import type { AutomationAdapter } from './adapters/electronAutomationAdapter'
import { ElectronAutomationAdapter } from './adapters/electronAutomationAdapter'
import { MockAutomationAdapter, type MockAutomationOptions } from './adapters/mockAutomationAdapter'

export * from './events'
export { MockAutomationAdapter, createMockSteps } from './adapters/mockAutomationAdapter'
export { ElectronAutomationAdapter } from './adapters/electronAutomationAdapter'
export type { AutomationAdapter } from './adapters/electronAutomationAdapter'

export interface AutomationAdapterOptions {
  adapter?: AutomationAdapter
  mock?: MockAutomationOptions
}

export function createAutomationAdapter(options: AutomationAdapterOptions = {}): AutomationAdapter {
  const api = typeof window !== 'undefined' ? window.electronAPI?.automation : undefined
  return api ? new ElectronAutomationAdapter(api) : new MockAutomationAdapter(options.mock)
}
