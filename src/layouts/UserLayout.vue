<template>
  <div class="app-layout" data-testid="user-layout">
    <AppHeader :is-admin="false" @toggle-sidebar="toggleSidebar" />
    
    <!-- 移动端侧边栏遮罩 -->
    <div
      v-if="showMobileSidebar"
      class="sidebar-overlay"
      @click="closeSidebar"
    ></div>
    
    <div class="main-container" :class="{ 'tool-visible': appStore.toolVisible, 'is-dragging': isDragging }">
      <!-- 左侧：应用主界面 -->
      <div class="left-panel" :style="appStore.toolVisible ? { width: leftPanelWidth } : {}">
        <div class="layout-studio">
          <UserSidebar 
            :class="{ 'mobile-open': showMobileSidebar }" 
            ref="sidebarRef"
          />
          <main class="content-studio" data-testid="user-content">
            <Breadcrumb />
            <AnnouncementBanner />
            <router-view v-slot="{ Component }">
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
      
      <!-- 分隔条 -->
      <div v-if="appStore.toolVisible" class="splitter" @mousedown="startDrag">
        <div class="splitter-handle"></div>
      </div>
      
      <!-- 右侧：工具网页（webview） -->
      <div v-if="appStore.toolVisible" class="right-panel" :style="{ width: rightPanelWidth }">
        <div class="webview-header">
          <span class="webview-title">{{ appStore.currentTool?.name || '工具' }}</span>
          <div class="webview-actions">
            <button class="webview-btn" @click="openInBrowser" aria-label="在浏览器中打开" title="在浏览器中打开">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
              </svg>
            </button>
            <button class="webview-btn" @click="refreshTool" aria-label="刷新" title="刷新">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
            </button>
            <button class="webview-btn close" @click="closeTool" aria-label="关闭工具" title="关闭">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- webview 加载状态 -->
        <div v-if="webviewLoading" class="webview-loading">
          <div class="loading-spinner"></div>
          <span>加载中...</span>
        </div>
        
        <!-- webview 错误状态 -->
        <div v-if="webviewError" class="webview-error">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
          <h3>页面加载失败</h3>
          <p>无法连接到目标网站，请检查网络连接</p>
          <button class="retry-btn" @click="retryLoadWebview">重试</button>
        </div>
        
        <webview 
          ref="webviewRef"
          :src="appStore.toolUrl" 
          class="tool-webview"
          :partition="webviewPartition"
          v-show="!webviewError"
        ></webview>
      </div>
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
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Auth, showToast, getDeviceId } from '@/utils'
import AnnouncementBanner from '@/components/AnnouncementBanner.vue'
import { checkAuthStatus } from '@/utils/api'
import AppHeader from '@/components/AppHeader.vue'
import UserSidebar from '@/components/UserSidebar.vue'
import Breadcrumb from '@/components/Breadcrumb.vue'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const router = useRouter()
const route = useRoute()
const showKickout = ref(false)
const kickoutMessage = ref('')
const showMobileSidebar = ref(false)
const sidebarRef = ref(null)
let pollTimer = null
let initialTimer = null

// webview 状态
const webviewLoading = ref(false)
const webviewError = ref(false)
const webviewRef = ref(null)

// webview 分区（用于隔离 cookie）
const webviewPartition = 'persist:tool-webview'

// 分隔条拖拽状态
const splitRatio = ref(parseFloat(localStorage.getItem('splitRatio') || '0.5'))
const isDragging = ref(false)

// 计算分屏宽度
const leftPanelWidth = computed(() => `${(1 - splitRatio.value) * 100}%`)
const rightPanelWidth = computed(() => `${splitRatio.value * 100}%`)

// 关闭工具
function closeTool() {
  webviewLoading.value = false
  webviewError.value = false
  appStore.closeTool()
}

// 刷新工具
function refreshTool() {
  if (webviewRef.value && typeof webviewRef.value.reload === 'function') {
    webviewRef.value.reload()
    showToast('已刷新工具页面', 'success')
  }
}

// 在浏览器中打开
function openInBrowser() {
  const url = appStore.currentTool?.targetUrl || appStore.toolUrl
  if (url && window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url)
  } else if (url) {
    window.open(url, '_blank')
  }
}

// webview 错误重试
function retryLoadWebview() {
  webviewError.value = false
  if (webviewRef.value && typeof webviewRef.value.loadURL === 'function') {
    webviewRef.value.loadURL(appStore.toolUrl)
  }
}

// 分隔条拖拽
function startDrag(e) {
  isDragging.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  
  const startX = e.clientX
  const startRatio = splitRatio.value
  
  function onMouseMove(e) {
    const container = document.querySelector('.main-container')
    if (!container) return
    
    const rect = container.getBoundingClientRect()
    const delta = startX - e.clientX
    const newRatio = startRatio + delta / rect.width
    
    // 限制比例在 30% - 70% 之间
    splitRatio.value = Math.max(0.3, Math.min(0.7, newRatio))
  }
  
  function onMouseUp() {
    isDragging.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    localStorage.setItem('splitRatio', splitRatio.value.toString())
    
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
  
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

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
  // 登出时恢复默认窗口
  window.electronAPI?.resizeWindow('reset')
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

// 监听工具打开，设置 webview 事件
watch(() => appStore.toolVisible, (visible) => {
  if (visible) {
    webviewLoading.value = true
    webviewError.value = false
    nextTick(() => {
      const webview = document.querySelector('.tool-webview')
      if (webview) {
        webview.addEventListener('did-start-loading', () => {
          webviewLoading.value = true
          webviewError.value = false
        })
        webview.addEventListener('did-stop-loading', () => {
          webviewLoading.value = false
        })
        webview.addEventListener('did-fail-load', (e) => {
          webviewLoading.value = false
          // -3 是 ABORTED（用户取消导航），不算错误
          if (e.errorCode !== -3) {
            webviewError.value = true
          }
        })
      }
    })
  } else {
    webviewLoading.value = false
    webviewError.value = false
  }
})

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
/* 全局容器 */
.app-layout {
  background: var(--studio-bg, #F5F6F9);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header 左侧留空，为固定侧边栏让位 */
.app-layout :deep(.studio-header) {
  margin-left: var(--sidebar-width, 200px);
}

/* 主容器：左右分屏 */
.main-container {
  display: flex;
  flex: 1;
  min-height: calc(100vh - var(--header-height));
  overflow: hidden;
}

/* 左侧面板 */
.left-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  transition: width 0.15s ease-out;
  overflow: hidden;
}

/* 分隔条 */
.splitter {
  width: 6px;
  background: var(--studio-border, #E2E8F0);
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  flex-shrink: 0;
  z-index: 10;
}

.splitter:hover,
.main-container.is-dragging .splitter {
  background: var(--studio-accent, #0EA5E9);
}

.splitter-handle {
  width: 2px;
  height: 32px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 1px;
}

/* 右侧面板（工具 webview） */
.right-panel {
  display: flex;
  flex-direction: column;
  background: white;
  transition: width 0.15s ease-out;
  overflow: hidden;
  position: relative;
}

/* webview 头部 */
.webview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--studio-frame, #0F172A);
  color: white;
  flex-shrink: 0;
}

.webview-title {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.webview-actions {
  display: flex;
  gap: 4px;
}

.webview-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.2s;
}

.webview-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.webview-btn.close:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #EF4444;
}

/* webview 加载状态 */
.webview-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--studio-text-muted, #64748B);
  font-size: 14px;
  z-index: 10;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--studio-border, #E2E8F0);
  border-top-color: var(--studio-accent, #0EA5E9);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* webview 错误状态 */
.webview-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--studio-text-muted, #64748B);
  text-align: center;
  z-index: 10;
}

.webview-error svg {
  color: var(--studio-danger, #EF4444);
  opacity: 0.5;
}

.webview-error h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--studio-text-main, #1E293B);
  margin: 0;
}

.webview-error p {
  font-size: 13px;
  margin: 0;
}

.retry-btn {
  margin-top: 8px;
  padding: 8px 20px;
  background: var(--studio-accent, #0EA5E9);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.retry-btn:hover {
  background: var(--studio-accent-hover, #0284C7);
}

/* webview 容器 */
.tool-webview {
  flex: 1;
  width: 100%;
  border: none;
}

/* 全高骨架布局 - 侧边栏贴边 */
.layout-studio {
  flex: 1;
  display: flex;
  min-height: calc(100vh - var(--header-height));
}

/* 主内容区左侧留空，为固定侧边栏让位 */
.content-studio {
  flex: 1;
  min-width: 0;
  padding: var(--spacing-lg);
  overflow-y: auto;
  margin-left: var(--sidebar-width, 200px);
}

/* 移动端：取消 margin-left，侧边栏变为抽屉式 */
@media (max-width: 1024px) {
  .app-layout :deep(.studio-header) {
    margin-left: 0;
  }
  .content-studio {
    margin-left: 0;
  }
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
    flex-direction: column;
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
  color: var(--studio-danger);
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