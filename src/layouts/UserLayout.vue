<template>
  <div class="app-layout" data-testid="user-layout">
    <ToolWorkspace v-if="appStore.toolVisible" />

    <template v-else>
      <AppHeader :is-admin="false" @toggle-sidebar="toggleSidebar" />

      <div v-if="showMobileSidebar" class="sidebar-overlay" @click="closeSidebar"></div>

      <div class="main-container">
        <UserSidebar ref="sidebarRef" :class="{ 'mobile-open': showMobileSidebar }" />
        <main class="content-studio" data-testid="user-content">
          <AnnouncementBanner />
          <router-view v-slot="{ Component }">
            <Suspense>
              <template #default><component :is="Component" /></template>
              <template #fallback><LoadingSkeleton :type="route.meta?.skeleton || 'default'" /></template>
            </Suspense>
          </router-view>
        </main>
      </div>
    </template>

    <div
      v-if="showKickout"
      class="kickout-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kickout-title"
      aria-describedby="kickout-message"
      @keydown.escape="goToLogin"
    >
      <div class="kickout-card">
        <div class="kickout-icon"><CircleAlert :size="32" /></div>
        <h3 id="kickout-title">授权异常</h3>
        <p id="kickout-message">{{ kickoutMessage }}</p>
        <button class="btn btn-primary" type="button" @click="goToLogin">返回登录</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CircleAlert } from '@lucide/vue'
import { Auth, getDeviceId } from '@/utils'
import { authService } from '@/utils/auth'
import { checkAuthStatus } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import AnnouncementBanner from '@/components/AnnouncementBanner.vue'
import AppHeader from '@/components/AppHeader.vue'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'
import ToolWorkspace from '@/components/ToolWorkspace.vue'
import UserSidebar from '@/components/UserSidebar.vue'

const appStore = useAppStore()
const router = useRouter()
const route = useRoute()
const showKickout = ref(false)
const kickoutMessage = ref('')
const showMobileSidebar = ref(false)
const sidebarRef = ref(null)
let pollTimer = null
let initialTimer = null
let removeAfterEach = null
let removeNotification = null

function toggleSidebar() {
  showMobileSidebar.value = !showMobileSidebar.value
  document.body.style.overflow = showMobileSidebar.value ? 'hidden' : ''
  if (showMobileSidebar.value) {
    nextTick(() => sidebarRef.value?.$el?.querySelector('a, button')?.focus())
  }
}

function closeSidebar() {
  showMobileSidebar.value = false
  document.body.style.overflow = ''
}

function handleKeydown(event) {
  if (event.key === 'Escape' && showMobileSidebar.value) closeSidebar()
}

function goToLogin() {
  Auth.clear()
  showKickout.value = false
  closeSidebar()
  router.push('/user/login')
}

async function checkStatus() {
  const authCode = Auth.get()
  if (!authCode || authCode === 'admin') return
  try {
    const response = await checkAuthStatus(authCode, getDeviceId())
    if (!response.success) {
      kickoutMessage.value = response.message || '授权已失效，请重新登录'
      showKickout.value = true
      stopPolling()
    } else if (response.data) {
      authService.setUser({ ...(authService.getUser() || {}), ...response.data })
    }
  } catch (error) {
    console.warn('Auth status check failed:', error)
  }
}

function startPolling() {
  pollTimer = setInterval(checkStatus, 2 * 60 * 1000)
  initialTimer = setTimeout(checkStatus, 10000)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  if (initialTimer) clearTimeout(initialTimer)
  pollTimer = null
  initialTimer = null
}

onMounted(() => {
  startPolling()
  window.addEventListener('keydown', handleKeydown)
  removeAfterEach = router.afterEach(closeSidebar)
  removeNotification = window.electronAPI?.notifications?.onFocus?.(payload => {
    if (payload?.mode !== 'single') return
    router.push('/user/tools')
  })
})

onUnmounted(() => {
  stopPolling()
  removeAfterEach?.()
  removeNotification?.()
  document.body.style.overflow = ''
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-canvas);
}

.app-layout :deep(.studio-header) {
  margin-left: var(--sidebar-width);
}

.main-container {
  min-height: calc(100vh - var(--header-height));
  display: flex;
  width: 100%;
}

.content-studio {
  min-width: 0;
  flex: 1;
  margin-left: var(--sidebar-width);
  padding: 24px clamp(18px, 3vw, 42px) 48px;
  overflow-y: auto;
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  z-index: 998;
  background: var(--color-overlay);
  backdrop-filter: blur(5px);
}

.kickout-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--color-overlay);
  backdrop-filter: blur(8px);
}

.kickout-card {
  width: min(400px, 100%);
  padding: 36px;
  border-radius: var(--radius-xl);
  background: var(--studio-surface);
  box-shadow: var(--shadow-xl);
  text-align: center;
}

.kickout-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--studio-danger);
  background: rgba(239, 68, 68, 0.1);
}

.kickout-card h3 {
  margin: 0 0 10px;
  color: var(--studio-text-main);
  font-size: 20px;
}

.kickout-card p {
  margin: 0 0 22px;
  color: var(--studio-text-muted);
  line-height: 1.65;
}

@media (max-width: 1024px) {
  .app-layout :deep(.studio-header),
  .content-studio {
    margin-left: 0;
  }

  .content-studio {
    padding: 18px 16px 36px;
  }
}
</style>
