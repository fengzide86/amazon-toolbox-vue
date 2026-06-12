<template>
  <div class="update-overlay" v-if="showProgress">
    <div class="update-card">
      <div class="update-header">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
        </svg>
        <h3>正在下载更新</h3>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar" :style="{ width: progress.percent + '%' }"></div>
      </div>
      <div class="progress-info">
        <span class="progress-percent">{{ progress.percent }}%</span>
        <span class="progress-detail">
          {{ progress.transferred }}MB / {{ progress.total }}MB
          <span v-if="progress.speed"> · {{ progress.speed }}MB/s</span>
        </span>
      </div>
      <p class="update-hint">请耐心等待，下载完成后将提示安装</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const showProgress = ref(false)
const progress = ref({
  percent: 0,
  speed: '0',
  transferred: '0',
  total: '0'
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
  
  // 下载完成后隐藏
  if (data.percent >= 100) {
    setTimeout(() => {
      showProgress.value = false
    }, 2000)
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
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(8px);
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
  background: white;
  border-radius: 20px;
  padding: 2rem 2.5rem;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.2);
  text-align: center;
}

.update-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.update-header svg {
  width: 28px;
  height: 28px;
  color: var(--color-accent, #6366F1);
  animation: bounce 1.5s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.update-header h3 {
  font-family: var(--font-heading);
  font-size: 1.2rem;
  color: var(--color-primary);
  margin: 0;
}

.progress-bar-container {
  width: 100%;
  height: 12px;
  background: #E2E8F0;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent, #6366F1), var(--color-accent-light, #818CF8));
  border-radius: 6px;
  transition: width 0.3s ease;
  position: relative;
}

.progress-bar::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.progress-percent {
  font-weight: 700;
  color: var(--color-accent, #6366F1);
  font-size: 1.1rem;
}

.progress-detail {
  color: var(--color-muted);
  font-size: 0.8rem;
}

.update-hint {
  color: var(--color-muted);
  font-size: 0.8rem;
  margin: 0;
}
</style>