import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import MessageCenter from '@/features/announcements/MessageCenter.vue'

const mocks = vi.hoisted(() => ({
  getAnnouncementFeed: vi.fn(),
  markAnnouncementRead: vi.fn(),
  dismissAnnouncement: vi.fn(),
}))

vi.mock('@/utils/api', () => ({
  getAnnouncementFeed: mocks.getAnnouncementFeed,
  markAnnouncementRead: mocks.markAnnouncementRead,
  dismissAnnouncement: mocks.dismissAnnouncement,
}))

describe('MessageCenter', () => {
  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    mocks.getAnnouncementFeed.mockResolvedValue([])
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('把抽屉传送到 body，避免被头部层叠上下文压住', async () => {
    const wrapper = mount(MessageCenter, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    await flushPromises()

    await wrapper.find('.message-trigger').trigger('click')
    await flushPromises()

    expect(wrapper.find('.drawer-layer').exists()).toBe(false)
    expect(document.body.querySelector('.drawer-layer')).not.toBeNull()
    expect(document.body.querySelector('.message-drawer')?.getAttribute('aria-modal')).toBe('true')
    wrapper.unmount()
  }, 15_000)
})
