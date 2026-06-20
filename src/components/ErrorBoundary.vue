<template>
  <div>
    <slot v-if="!error"></slot>
    <div v-else class="error-boundary">
      <div class="error-content">
        <div class="error-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h2 class="error-title">页面出错了</h2>
        <p class="error-message">{{ errorMessage }}</p>
        <div class="error-actions">
          <button @click="reload" class="btn-primary">重新加载</button>
          <button @click="goHome" class="btn-secondary">返回首页</button>
        </div>
        <details v-if="showDetails" class="error-details">
          <summary>错误详情</summary>
          <pre>{{ error.stack }}</pre>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  showDetails: {
    type: Boolean,
    default: () => import.meta.env.DEV
  }
})

const router = useRouter()
const error = ref(null)
const errorMessage = ref('发生了未知错误')

onErrorCaptured((err, instance, info) => {
  error.value = err
  errorMessage.value = err.message || '发生了未知错误'
  
  // 记录错误到控制台
  console.error('[ErrorBoundary] Caught error:', err)
  console.error('[ErrorBoundary] Component:', instance?.$options?.name || 'Unknown')
  console.error('[ErrorBoundary] Info:', info)
  
  // 发送到错误追踪服务
  if (import.meta.env.PROD) {
    sendErrorToAnalytics(err, instance, info)
  }
  
  // 阻止错误继续传播
  return false
})

function reload() {
  window.location.reload()
}

function goHome() {
  error.value = null
  router.push('/')
}

function sendErrorToAnalytics(err, instance, info) {
  // 集成 Sentry 或其他错误追踪服务
  if (window.Sentry) {
    window.Sentry.captureException(err, {
      extra: {
        component: instance?.$options?.name,
        info: info
      }
    })
  }
  
  // 也可以发送到后端 API
  fetch('/api/analytics/error', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      error: err.message,
      stack: err.stack,
      component: instance?.$options?.name,
      info: info,
      url: window.location.href,
      timestamp: Date.now(),
    }),
    keepalive: true,
  }).catch(() => {
    // 静默失败
  })
}
</script>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.error-content {
  background: white;
  border-radius: 16px;
  padding: 3rem;
  max-width: 500px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.error-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 1.5rem;
  color: #ef4444;
}

.error-icon svg {
  width: 100%;
  height: 100%;
}

.error-title {
  font-size: 1.875rem;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 1rem;
}

.error-message {
  font-size: 1rem;
  color: #6b7280;
  margin-bottom: 2rem;
  line-height: 1.6;
}

.error-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 2rem;
}

.btn-primary {
  padding: 0.75rem 1.5rem;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: #4338ca;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
}

.btn-secondary {
  padding: 0.75rem 1.5rem;
  background: white;
  color: #4f46e5;
  border: 2px solid #4f46e5;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #f3f4f6;
  transform: translateY(-2px);
}

.error-details {
  text-align: left;
  margin-top: 2rem;
}

.error-details summary {
  cursor: pointer;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 1rem;
}

.error-details pre {
  background: #f3f4f6;
  padding: 1rem;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.875rem;
  color: #374151;
}
</style>