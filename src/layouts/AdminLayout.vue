<template>
  <div class="app-layout">
    <AppHeader :is-admin="true" @toggle-sidebar="toggleSidebar" @platform-change="handlePlatformChange" />
    
    <!-- 移动端侧边栏遮罩 -->
    <div
      v-if="showMobileSidebar"
      class="sidebar-overlay"
      @click="closeSidebar"
    ></div>
    
    <div class="layout">
      <AdminSidebar :class="{ 'mobile-open': showMobileSidebar }" />
      <main class="content">
        <Breadcrumb />
        <router-view :key="platformKey" v-slot="{ Component }">
          <Suspense>
            <template #default>
              <component :is="Component" />
            </template>
            <template #fallback>
              <LoadingSkeleton :type="route.meta?.skeleton || 'default'" />
            </template>
          </Suspense>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usePlatformStore } from '@/stores/platform'
import AppHeader from '@/components/AppHeader.vue'
import AdminSidebar from '@/components/AdminSidebar.vue'
import Breadcrumb from '@/components/Breadcrumb.vue'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'

const router = useRouter()
const route = useRoute()
const platformStore = usePlatformStore()
const showMobileSidebar = ref(false)
const platformKey = ref(0)

function toggleSidebar() {
  showMobileSidebar.value = !showMobileSidebar.value
  document.body.style.overflow = showMobileSidebar.value ? 'hidden' : ''
}

function closeSidebar() {
  showMobileSidebar.value = false
  document.body.style.overflow = ''
}

function handlePlatformChange() {
  // 切换平台时强制重新渲染子组件，触发数据重新加载
  platformKey.value++
}

// 路由变化时关闭侧边栏
router.afterEach(() => {
  closeSidebar()
})

onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  background: var(--studio-bg, #F1F5F9);
  display: flex;
  flex-direction: column;
}

/* Header 左侧留空，为固定侧边栏让位 */
.app-layout :deep(.studio-header) {
  margin-left: var(--sidebar-width, 200px);
}

/* 主布局 - 侧边栏全高，内容区独立 */
.layout {
  flex: 1;
  display: flex;
  min-height: calc(100vh - var(--header-height, 56px));
}

/* 主内容区左侧留空，为固定侧边栏让位 */
.content {
  flex: 1;
  min-width: 0;
  padding: var(--spacing-lg, 1.5rem);
  overflow-y: auto;
  overflow-x: hidden;
  margin-left: var(--sidebar-width, 200px);
  max-width: calc(100vw - var(--sidebar-width, 200px));
  box-sizing: border-box;
}

/* 移动端：取消 margin-left，侧边栏变为抽屉式 */
@media (max-width: 1024px) {
  .app-layout :deep(.studio-header) {
    margin-left: 0;
  }
  .content {
    margin-left: 0;
  }
}

.content > :deep(*) {
  max-width: var(--content-max-width, 1400px);
  margin-left: auto;
  margin-right: auto;
}

/* 移动端侧边栏遮罩 */
.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  z-index: 998;
}

@media (max-width: 1024px) {
  .sidebar-overlay {
    display: block;
  }
  .layout {
    flex-direction: column;
  }
  .content {
    padding: var(--spacing-md, 1rem);
  }
}
</style>
