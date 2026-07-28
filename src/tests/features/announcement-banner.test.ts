import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import AnnouncementBanner from '@/components/AnnouncementBanner.vue'

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

describe('AnnouncementBanner', () => {
  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    mocks.getAnnouncementFeed.mockResolvedValue([{
      id: 8,
      title: '重要公告',
      content: '请先阅读公告内容',
      type: 'maintenance',
      audience: 'consumer',
      category: 'maintenance',
      severity: 'critical',
      presentation: 'modal',
      priority: 100,
      revision: 1,
      created_at: '2026-07-21T00:00:00Z',
      is_read: false,
      is_dismissed: false,
    }])
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('把重要公告传送到 body，避免被页面工具栏层叠上下文盖住', async () => {
    const wrapper = mount(AnnouncementBanner, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    await flushPromises()

    expect(wrapper.find('.announcement-overlay').exists()).toBe(false)
    const overlay = document.body.querySelector('.announcement-overlay')
    expect(overlay).not.toBeNull()
    expect(overlay?.getAttribute('aria-modal')).toBe('true')
    wrapper.unmount()
  })
})
