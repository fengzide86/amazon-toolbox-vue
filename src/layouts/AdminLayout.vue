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
        <router-view :key="platformKey" />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlatformStore } from '@/stores/platform'
import AppHeader from '@/components/AppHeader.vue'
import AdminSidebar from '@/components/AdminSidebar.vue'
import Breadcrumb from '@/components/Breadcrumb.vue'

const router = useRouter()
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
}

/* 主布局 - 与 UserLayout 保持一致的 grid 布局 */
.layout {
  max-width: var(--content-max-width, 1400px);
  margin: 0 auto;
  padding: var(--spacing-md, 1rem) var(--spacing-lg, 1.5rem);
  display: grid;
  grid-template-columns: var(--sidebar-width, 220px) 1fr;
  gap: var(--spacing-lg, 1.5rem);
  min-height: calc(100vh - var(--header-height, 56px));
}

.content {
  min-width: 0;
  background: var(--studio-surface, white);
  border-radius: var(--radius-lg, 16px);
  padding: var(--spacing-lg, 1.5rem);
  box-shadow: var(--studio-shadow, 0 1px 3px rgba(0,0,0,0.06));
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
    grid-template-columns: 1fr;
    padding: var(--spacing-sm, 0.75rem);
  }
  .content {
    padding: var(--spacing-md, 1rem);
  }
}
</style>
