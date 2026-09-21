import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authService } from '@/utils/auth'
import { useAgentProfile } from '@/features/agency/useAgentProfile'

afterEach(() => vi.restoreAllMocks())

describe('agent profile lifetime', () => {
  it('updates account labels when the current-tab profile changes and releases listeners', async () => {
    const getUser = vi.spyOn(authService, 'getUser').mockReturnValue({ role: 'agent', display_name: '代理 A', agency_id: 1 })
    const remove = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(defineComponent({ setup: () => ({ user: useAgentProfile() }), template: '<p>{{ user?.display_name }}</p>' }))
    expect(wrapper.text()).toBe('代理 A')
    getUser.mockReturnValue({ role: 'agent', display_name: '代理 A 新名称', agency_id: 1 })
    window.dispatchEvent(new CustomEvent('toolbox:user-updated'))
    await nextTick()
    expect(wrapper.text()).toBe('代理 A 新名称')
    getUser.mockReturnValue(null)
    window.dispatchEvent(new CustomEvent('toolbox:auth-cleared'))
    await nextTick()
    expect(wrapper.text()).toBe('')
    wrapper.unmount()
    expect(remove).toHaveBeenCalledWith('toolbox:user-updated', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('toolbox:auth-cleared', expect.any(Function))
  })
})
