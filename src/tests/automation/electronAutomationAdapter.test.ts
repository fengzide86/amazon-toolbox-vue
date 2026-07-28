import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { ElectronAutomationAdapter } from '@/automation/adapters/electronAutomationAdapter'
import type { AutomationBridge } from '@/shared/ipc/electron-api'

describe('ElectronAutomationAdapter', () => {
  it('在进入 Electron IPC 前移除 Vue 响应式代理', async () => {
    const start = vi.fn(async (payload: unknown) => structuredClone(payload))
    const api = {
      start,
      pause: vi.fn(),
      resume: vi.fn(),
      completeUserAction: vi.fn(),
      cancel: vi.fn(),
      onEvent: vi.fn(() => () => undefined),
    } as unknown as AutomationBridge
    const tool = reactive({
      id: 'demo-register',
      name: '新手快速注册工具',
      executionMode: 'demo' as const,
      executionContext: reactive({ mode: 'single', input: reactive({ country: 'US' }) }),
    })

    const result = await new ElectronAutomationAdapter(api).start(tool)

    expect(result).toEqual(expect.objectContaining({
      id: 'demo-register',
      executionContext: { mode: 'single', input: { country: 'US' } },
    }))
    expect(start).toHaveBeenCalledOnce()
    expect(start.mock.calls[0]?.[0]).not.toBe(tool)
  })
})
