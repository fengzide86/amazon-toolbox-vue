<template>
  <div class="app-layout" data-testid="user-layout">
    <AppHeader :is-admin="false" @toggle-sidebar="toggleSidebar" />
    
    <!-- 移动端侧边栏遮罩 -->
    <div
      v-if="showMobileSidebar"
      class="sidebar-overlay"
      @click="closeSidebar"
    ></div>
    
    <div class="layout-studio">
      <UserSidebar 
        :class="{ 'mobile-open': showMobileSidebar }" 
        ref="sidebarRef"
      />
      <main class="content-studio" data-testid="user-content">
        <Breadcrumb />
        <AnnouncementBanner />
        <router-view />
      </main>
    </div>
    <!-- 踢人提示弹窗 -->
    <div
      v-if="showKickout"
      class="kickout-overlay show"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kickout-title"
      aria-describedby="kickout-message"
      @click.self="goToLogin"
      @keydown.escape="goToLogin"
    >
      <div class="kickout-card" ref="kickoutCard">
        <div class="kickout-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h3 id="kickout-title">授权异常</h3>
        <p id="kickout-message">{{ kickoutMessage }}</p>
        <button class="btn btn-primary" @click="goToLogin" autofocus>返回登录</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Auth, showToast, getDeviceId } from '@/utils'
import AnnouncementBanner from '@/components/AnnouncementBanner.vue'
import { checkAuthStatus } from '@/utils/api'
import AppHeader from '@/components/AppHeader.vue'
import UserSidebar from '@/components/UserSidebar.vue'
import Breadcrumb from '@/components/Breadcrumb.vue'

const router = useRouter()
const route = useRoute()
const showKickout = ref(false)
const kickoutMessage = ref('')
const showMobileSidebar = ref(false)
const sidebarRef = ref(null)
let pollTimer = null
let initialTimer = null

function toggleSidebar() {
  showMobileSidebar.value = !showMobileSidebar.value
  // 防止背景滚动
  document.body.style.overflow = showMobileSidebar.value ? 'hidden' : ''
  
  // 焦点管理：侧边栏打开时将焦点移入侧边栏
  if (showMobileSidebar.value) {
    nextTick(() => {
      const firstLink = sidebarRef.value?.$el?.querySelector('.sidebar-nav a')
      if (firstLink) {
        firstLink.focus()
      }
    })
  }
}

function closeSidebar() {
  showMobileSidebar.value = false
  document.body.style.overflow = ''
}

// 键盘导航：Escape 关闭侧边栏
function handleKeydown(e) {
  if (e.key === 'Escape' && showMobileSidebar.value) {
    closeSidebar()
  }
  
  // Tab 键焦点限制在侧边栏内
  if (e.key === 'Tab' && showMobileSidebar.value && sidebarRef.value) {
    const sidebar = sidebarRef.value.$el
    const focusable = sidebar.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])')
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

function goToLogin() {
  Auth.clear()
  localStorage.removeItem('toolbox_role')
  localStorage.removeItem('toolbox_user')
  showKickout.value = false
  closeSidebar()
  router.push('/user/login')
}

async function checkStatus() {
  const authCode = Auth.get()
  if (!authCode || authCode === 'admin') return

  try {
    const deviceId = getDeviceId()
    const res = await checkAuthStatus(authCode, deviceId)
    if (!res.success) {
      kickoutMessage.value = res.message
      showKickout.value = true
      stopPolling()
    }
  } catch (err) {
    // 网络错误不踢人，只打日志
    console.warn('Auth status check failed:', err)
  }
}

function startPolling() {
  // 每2分钟检查一次
  pollTimer = setInterval(checkStatus, 2 * 60 * 1000)
  // 10秒后首次检查
  initialTimer = setTimeout(checkStatus, 10000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (initialTimer) {
    clearTimeout(initialTimer)
    initialTimer = null
  }
}

// 路由变化时关闭侧边栏
router.afterEach(() => {
  closeSidebar()
})

onMounted(() => {
  startPolling()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  stopPolling()
  document.body.style.overflow = ''
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
/* Studio Milk & Slate 布局 */
.layout-studio {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: var(--spacing-md) var(--spacing-lg);
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  gap: var(--spacing-lg);
  min-height: calc(100vh - var(--header-height));
}

.content-studio {
  min-width: 0;
  background: var(--studio-surface);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  box-shadow: var(--studio-shadow);
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
  .layout-studio {
    grid-template-columns: 1fr;
    padding: var(--spacing-sm);
  }
  .content-studio {
    padding: var(--spacing-md);
  }
}

.kickout-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(15,23,42,0.7);
  backdrop-filter: blur(8px);
  z-index: 2000;
  align-items: center;
  justify-content: center;
}
.kickout-overlay.show {
  display: flex;
}
.kickout-card {
  background: white;
  border-radius: 20px;
  padding: 2.5rem;
  max-width: 400px;
  width: 90%;
  text-align: center;
  box-shadow: 0 25px 50px rgba(0,0,0,0.2);
}
.kickout-icon {
  width: 64px;
  height: 64px;
  background: rgba(239,68,68,0.1);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}
.kickout-icon svg {
  width: 32px;
  height: 32px;
  color: #EF4444;
}
.kickout-card h3 {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  color: var(--color-primary);
  margin-bottom: 0.75rem;
}
.kickout-card p {
  color: var(--color-muted);
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1.5rem;
}
</style>
