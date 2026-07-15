import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAnnouncementStore } from './store'

const api = vi.hoisted(() => ({
  getAnnouncementFeed: vi.fn(),
  markAnnouncementRead: vi.fn(),
  dismissAnnouncement: vi.fn(),
}))

vi.mock('@/utils/api', () => api)

const announcement = {
  id: 1,
  title: '维护通知',
  content: '请保存当前工作',
  type: 'maintenance',
  audience: 'business',
  category: 'maintenance',
  severity: 'critical',
  presentation: 'modal',
  priority: 100,
  revision: 2,
  created_at: '2026-07-15T12:00:00',
  is_read: false,
  is_dismissed: false,
}

describe('announcement center store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    api.getAnnouncementFeed.mockResolvedValue([announcement])
    api.markAnnouncementRead.mockResolvedValue({ success: true })
    api.dismissAnnouncement.mockResolvedValue({ success: true })
  })

  it('derives unread and critical state only from server receipts', async () => {
    const store = useAnnouncementStore()
    await store.load()
    expect(store.unreadCount).toBe(1)
    expect(store.critical?.revision).toBe(2)
  })

  it('marks and dismisses the exact announcement revision in local state', async () => {
    const store = useAnnouncementStore()
    await store.load()
    const item = store.items[0]
    expect(item).toBeDefined()
    if (!item) return

    await store.dismiss(item)

    expect(api.dismissAnnouncement).toHaveBeenCalledWith(1)
    expect(store.unreadCount).toBe(0)
    expect(store.critical).toBeNull()
  })
})
