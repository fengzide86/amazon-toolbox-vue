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
  const api = typeof window !== 'undefined' ? window.electronAPI?.automation : undefined
  // 桌面端的 Demo 也交给真实 Runner，在本机沙盒页面中完成真实填写、点击和核验。
  // 浏览器版没有本地 Runner 时继续使用轻量预览适配器。
  if (options.mode === 'demo') return api ? new ElectronAutomationAdapter(api) : new DemoAutomationAdapter(options.mock)
  if (!api) throw new Error('LIVE_RUNTIME_UNAVAILABLE: 真实工具仅支持桌面客户端')
  return new ElectronAutomationAdapter(api)
}
