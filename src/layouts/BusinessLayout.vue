<template>
  <div class="business-layout">
    <AppHeader is-business @toggle-sidebar="showSidebar = !showSidebar" />
    <div v-if="showSidebar" class="sidebar-overlay" @click="showSidebar = false"></div>
    <BusinessSidebar :class="{ 'mobile-open': showSidebar }" />
    <main :class="['business-content', { 'is-workspace': route.name === 'BusinessWorkspace' }]">
      <router-view v-slot="{ Component }">
        <Suspense><component :is="Component" /></Suspense>
      </router-view>
    </main>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import BusinessSidebar from '@/components/BusinessSidebar.vue'
import { useBusinessWorkspaceStore } from '@/stores/businessWorkspace'
import { getCurrentUser } from '@/utils/api'
import { authService } from '@/utils/auth'

const route = useRoute()
const router = useRouter()
const store = useBusinessWorkspaceStore()
const showSidebar = ref(false)
let removeAfterEach
let removeNotification
let accessTimer

async function refreshAccess() {
  const user = await getCurrentUser()
  authService.setUser(user)
  const allowed = user?.product_type === 'business'
    && user?.business_workspace_enabled === true
    && user?.entitlements?.batch_execution === true
    && user?.entitlements?.multi_account_workspace === true
  if (!allowed) {
    if (store.isActive) await store.cancelBatch('interrupted').catch(() => {})
    await router.replace('/user/tools')
  }
  return allowed
}

onMounted(async () => {
  try { await store.init() }
  catch (error) {
    if (error?.status === 403) await refreshAccess().catch(() => router.replace('/user/tools'))
    else throw error
  }
  accessTimer = setInterval(() => refreshAccess().catch(() => {}), 30000)
  removeAfterEach = router.afterEach(() => { showSidebar.value = false })
  removeNotification = window.electronAPI?.notifications?.onFocus?.(payload => {
    if (payload?.mode !== 'batch') return
    router.push('/business/workspace')
    if (payload.itemId) store.selectItem(payload.itemId)
  })
})
onUnmounted(() => { clearInterval(accessTimer); removeAfterEach?.(); removeNotification?.(); store.dispose() })
</script>

<style scoped>
.business-layout{min-height:100vh;background:var(--color-canvas);overflow:hidden}.business-layout :deep(.studio-header){margin-left:var(--sidebar-width)}
.business-content{min-width:0;min-height:calc(100vh - var(--header-height));margin-left:var(--sidebar-width);padding:24px clamp(18px,3vw,42px) 48px;overflow-x:hidden}.business-content:not(.is-workspace)>:deep(*){width:min(1180px,100%);margin-inline:auto}.business-content.is-workspace{height:calc(100vh - var(--header-height));padding:16px 18px 18px;overflow:hidden}
.sidebar-overlay{position:fixed;inset:0;z-index:998;background:var(--color-overlay);backdrop-filter:blur(4px)}
@media(max-width:1024px){.business-layout :deep(.studio-header),.business-content{margin-left:0}.business-content{padding:18px 16px 36px}.business-content.is-workspace{padding:10px;height:calc(100vh - var(--header-height))}}
</style>
