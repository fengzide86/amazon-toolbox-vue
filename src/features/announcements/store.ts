import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { dismissAnnouncement, getAnnouncementFeed, markAnnouncementRead } from '@/utils/api'
import { announcementFeedSchema, type Announcement } from './model'

export const useAnnouncementStore = defineStore('announcement-center', () => {
  const items = ref<Announcement[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  let request: Promise<void> | null = null

  const unreadCount = computed(() => items.value.filter(item => !item.is_read).length)
  const banner = computed(() => items.value.find(item => item.presentation === 'banner' && !item.is_dismissed) ?? null)
  const critical = computed(() => items.value.find(item => item.presentation === 'modal' && !item.is_dismissed) ?? null)

  async function load(force = false): Promise<void> {
    if (request) return request
    if (loaded.value && !force) return
    loading.value = true
    request = (async () => {
      const payload: unknown = await getAnnouncementFeed()
      items.value = announcementFeedSchema.parse(payload)
      loaded.value = true
    })().finally(() => {
      loading.value = false
      request = null
    })
    return request
  }

  async function read(item: Announcement): Promise<void> {
    if (item.is_read) return
    await markAnnouncementRead(item.id)
    item.is_read = true
  }

  async function dismiss(item: Announcement): Promise<void> {
    await dismissAnnouncement(item.id)
    item.is_read = true
    item.is_dismissed = true
  }

  return { items, loading, loaded, unreadCount, banner, critical, load, read, dismiss }
})
