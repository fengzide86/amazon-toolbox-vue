<template>
  <div class="business-layout density-balanced">
    <AppHeader is-business @toggle-sidebar="showSidebar = !showSidebar" />
    <div v-if="showSidebar" class="sidebar-overlay" @click="showSidebar = false"></div>
    <BusinessSidebar :class="{ 'mobile-open': showSidebar }" />
    <main :class="['business-content', { 'is-workspace': route.name === 'BusinessWorkspace' }]">
      <AppNoticeQueue
        :suppress-update="route.name === 'BusinessWorkspace' || store.isActive"
        :hide-announcement-banner="route.name === 'BusinessWorkspace'"
      />
      <router-view v-slot="{ Component }">
        <Suspense><component :is="Component" /></Suspense>
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import BusinessSidebar from '@/components/BusinessSidebar.vue'
import AppNoticeQueue from '@/features/shell/AppNoticeQueue.vue'
import { useBusinessDemoWorkspaceStore } from '@/stores/businessDemoWorkspace'
import { getCurrentUser } from '@/utils/api'
import { authService } from '@/utils/auth'
import { authenticatedUserSchema } from '@/features/auth/model'

const route = useRoute()
const router = useRouter()
const store = useBusinessDemoWorkspaceStore()
const showSidebar = ref(false)
let removeAfterEach: (() => void) | undefined
let accessTimer: ReturnType<typeof setInterval> | undefined

async function refreshAccess() {
  const user = authenticatedUserSchema.parse(await getCurrentUser())
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
  catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 403) {
      await refreshAccess().catch(() => router.replace('/user/tools'))
    }
    // A transient control-plane failure must not destroy the whole business shell.
  }
  accessTimer = setInterval(() => refreshAccess().catch(() => {}), 30000)
  removeAfterEach = router.afterEach(() => { showSidebar.value = false })
})
onUnmounted(() => {
  if (accessTimer) clearInterval(accessTimer)
  removeAfterEach?.()
  store.dispose()
})
</script>

<style scoped>
.business-layout{min-height:100vh;background:var(--color-canvas);overflow:hidden}.business-layout :deep(.studio-header){margin-left:var(--sidebar-width)}
.business-content{min-width:0;min-height:calc(100vh - var(--header-height));margin-left:var(--sidebar-width);padding:32px clamp(24px,3vw,42px) 48px;overflow-x:hidden}.business-content:not(.is-workspace)>:deep(*){width:min(1180px,100%);margin-inline:auto}.business-content.is-workspace{height:calc(100vh - var(--header-height));padding:16px 18px 18px;overflow:hidden}
.sidebar-overlay{position:fixed;inset:0;z-index:998;background:var(--color-overlay);backdrop-filter:blur(4px)}
@media(max-width:1024px){.business-layout :deep(.studio-header),.business-content{margin-left:0}.business-content{padding:18px 16px 36px}.business-content.is-workspace{padding:10px;height:calc(100vh - var(--header-height))}}
</style>
