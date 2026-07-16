import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type AppDrawer = 'announcements' | 'updates'

export const useOverlayCoordinatorStore = defineStore('overlay-coordinator', () => {
  const activeDrawer = ref<AppDrawer | null>(null)
  const criticalAnnouncementActive = ref(false)

  const drawerAvailable = computed(() => !criticalAnnouncementActive.value)

  function openDrawer(drawer: AppDrawer): boolean {
    if (!drawerAvailable.value) return false
    activeDrawer.value = drawer
    return true
  }

  function closeDrawer(drawer?: AppDrawer): void {
    if (!drawer || activeDrawer.value === drawer) activeDrawer.value = null
  }

  function setCriticalAnnouncement(active: boolean): void {
    criticalAnnouncementActive.value = active
    if (active) activeDrawer.value = null
  }

  return { activeDrawer, criticalAnnouncementActive, drawerAvailable, openDrawer, closeDrawer, setCriticalAnnouncement }
})
