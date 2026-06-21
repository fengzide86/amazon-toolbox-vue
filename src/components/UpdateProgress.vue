<template>
  <div class="update-overlay" v-if="showProgress">
    <div class="update-card">
      <!-- 头部：应用信息 -->
      <div class="update-header">
        <div class="app-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
        </div>
        <div class="version-info">
          <h3>亚马逊工具箱</h3>
          <div class="version-badge">
            <span class="old-version">v{{ currentVersion }}</span>
            <svg class="arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
            <span class="new-version">v{{ newVersion }}</span>
          </div>
        </div>
      </div>

      <!-- 进度条 -->
      <div class="progress-section">
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: progress.percent + '%' }">
            <div class="progress-shimmer"></div>
          </div>
        </div>
        <div class="progress-stats">
          <div class="stat-item">
            <span class="stat-label">进度</span>
            <span class="stat-value">{{ progress.percent }}%</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">已下载</span>
            <span class="stat-value">{{ progress.transferred }}MB / {{ progress.total }}MB</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">速度</span>
            <span class="stat-value">{{ progress.speed }}MB/s</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">剩余</span>
            <span class="stat-value">{{ remainingTime }}</span>
          </div>
        </div>
      </div>

      <!-- 更新内容 -->
      <div class="changelog-section" v-if="changelog.length > 0">
        <h4>📦 更新内容</h4>
        <ul class="changelog-list">
          <li v-for="(item, index) in changelog" :key="index">
            {{ item }}
          </li>
        </ul>
      </div>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <button class="btn-secondary" @click="pauseDownload" v-if="!isPaused">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="6" y="4" width="4" height="16"/>
            <rect x="14" y="4" width="4" height="16"/>
          </svg>
          暂停
        </button>
        <button class="btn-secondary" @click="resumeDownload" v-else>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          继续
        </button>
        <button class="btn-secondary" @click="minimizeToBackground">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          后台下载
        </button>
        <button class="btn-danger" @click="cancelDownload">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          取消
        </button>
      </div>

      <!-- 状态提示 -->
      <div class="status-hint" v-if="statusMessage">
        {{ statusMessage }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const showProgress = ref(false)
const isPaused = ref(false)
const statusMessage = ref('')

const progress = ref({
  percent: 0,
  speed: '0',
  transferred: '0',
  total: '0'
})

const currentVersion = ref('1.5.0')
const newVersion = ref('1.6.0')

const changelog = ref([
  '新增 AI 客服功能，支持智能问答',
  '优化启动速度，提升 30%',
  '修复已知问题，提升稳定性'
])

// 计算剩余时间
const remainingTime = computed(() => {
  const transferred = parseFloat(progress.value.transferred)
  const total = parseFloat(progress.value.total)
  const speed = parseFloat(progress.value.speed)
  
  if (speed === 0 || transferred === 0) return '计算中...'
  
  const remaining = total - transferred
  const seconds = Math.ceil(remaining / speed)
  
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}分${secs}秒`
})

function handleProgress(event) {
  const data = event.detail || event
  progress.value = {
    percent: data.percent || 0,
    speed: data.speed || '0',
    transferred: data.transferred || '0',
    total: data.total || '0'
  }
  showProgress.value = true
  isPaused.value = false
  statusMessage.value = ''
  
  // 下载完成后显示提示
  if (data.percent >= 100) {
    statusMessage.value = '✅ 下载完成，即将开始安装...'
    setTimeout(() => {
      showProgress.value = false
    }, 2000)
  }
}

function pauseDownload() {
  isPaused.value = true
  statusMessage.value = '⏸️ 下载已暂停'
  // 发送 IPC 事件给 Electron
  window.dispatchEvent(new CustomEvent('update-pause'))
}

function resumeDownload() {
  isPaused.value = false
  statusMessage.value = '▶️ 继续下载...'
  window.dispatchEvent(new CustomEvent('update-resume'))
}

function minimizeToBackground() {
  showProgress.value = false
  statusMessage.value = '📥 正在后台下载...'
  window.dispatchEvent(new CustomEvent('update-minimize'))
}

function cancelDownload() {
  if (confirm('确定要取消更新吗？')) {
    showProgress.value = false
    statusMessage.value = ''
    window.dispatchEvent(new CustomEvent('update-cancel'))
  }
}

onMounted(() => {
  // 监听 Electron IPC 事件（通过 window 事件中转）
  window.addEventListener('update-download-progress', handleProgress)
  
  // 也监听自定义事件（用于 Web 环境测试）
  window.addEventListener('update-progress', handleProgress)
})

onUnmounted(() => {
  window.removeEventListener('update-download-progress', handleProgress)
  window.removeEventListener('update-progress', handleProgress)
})
</script>

<style scoped>
.update-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(12px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.update-card {
  background: linear-gradient(135deg, #ffffff 0%, var(--studio-bg) 100%);
  border-radius: 24px;
  padding: 2rem;
  max-width: 480px;
  width: 90%;
  box-shadow: 
    0 25px 50px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 头部样式 */
.update-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.app-icon {
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, var(--studio-accent) 0%, #8b5cf6 100%);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 16px rgba(14, 165, 233, 0.3);
}

.app-icon svg {
  width: 32px;
  height: 32px;
  color: white;
}

.version-info {
  flex: 1;
}

.version-info h3 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--studio-text-main);
  margin: 0 0 0.25rem 0;
}

.version-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.old-version {
  color: var(--studio-text-muted);
  text-decoration: line-through;
}

.arrow {
  width: 16px;
  height: 16px;
  color: var(--studio-accent);
}

.new-version {
  color: var(--studio-accent);
  font-weight: 600;
  background: rgba(14, 165, 233, 0.1);
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

/* 进度条样式 */
.progress-section {
  margin-bottom: 1.5rem;
}

.progress-bar-container {
  width: 100%;
  height: 16px;
  background: var(--studio-border);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 1rem;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--studio-accent) 0%, #8b5cf6 50%, #a78bfa 100%);
  border-radius: 8px;
  transition: width 0.3s ease;
  position: relative;
  overflow: hidden;
}

.progress-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.4),
    transparent
  );
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}

.progress-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

.stat-item {
  text-align: center;
  padding: 0.5rem;
  background: var(--studio-bg);
  border-radius: 8px;
}

.stat-label {
  display: block;
  font-size: 0.75rem;
  color: var(--studio-text-muted);
  margin-bottom: 0.25rem;
}

.stat-value {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--studio-text-main);
}

/* 更新内容样式 */
.changelog-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--studio-bg);
  border-radius: 12px;
}

.changelog-section h4 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--studio-text-main);
  margin: 0 0 0.5rem 0;
}

.changelog-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.changelog-list li {
  font-size: 0.875rem;
  color: var(--el-text-color-regular);
  padding: 0.25rem 0;
  padding-left: 1.25rem;
  position: relative;
}

.changelog-list li::before {
  content: '•';
  position: absolute;
  left: 0;
  color: var(--studio-accent);
  font-weight: bold;
}

/* 按钮样式 */
.action-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.action-buttons button {
  flex: 1;
  min-width: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.625rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-buttons button svg {
  width: 16px;
  height: 16px;
}

.btn-secondary {
  background: var(--studio-bg-hover);
  color: var(--el-text-color-regular);
}

.btn-secondary:hover {
  background: var(--studio-border);
  transform: translateY(-1px);
}

.btn-danger {
  background: rgba(239, 68, 68, 0.1);
  color: var(--studio-danger-hover);
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.15);
  transform: translateY(-1px);
}

/* 状态提示 */
.status-hint {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  font-size: 0.875rem;
  color: var(--studio-success);
  text-align: center;
  animation: fadeIn 0.3s ease;
}

/* 响应式设计 */
@media (max-width: 480px) {
  .update-card {
    padding: 1.5rem;
  }
  
  .progress-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .action-buttons {
    flex-direction: column;
  }
  
  .action-buttons button {
    width: 100%;
  }
}
</style>