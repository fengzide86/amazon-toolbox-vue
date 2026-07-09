import { ElectronAutomationAdapter } from './adapters/electronAutomationAdapter'
import { MockAutomationAdapter } from './adapters/mockAutomationAdapter'

export * from './events'
export { MockAutomationAdapter, createMockSteps } from './adapters/mockAutomationAdapter'
export { ElectronAutomationAdapter } from './adapters/electronAutomationAdapter'

export function createAutomationAdapter(options = {}) {
  if (typeof window !== 'undefined' && window.electronAPI?.automation) {
    return new ElectronAutomationAdapter(window.electronAPI.automation)
  }
  return new MockAutomationAdapter(options.mock)
}
