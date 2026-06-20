<template>
  <div>
    <h2 class="page-title">设备管理</h2>

    <div class="device-info-banner">
      <AlertTriangle :size="20" />
      <span>每个授权码可绑定 <strong>{{ maxDevices }}</strong> 台设备，当前已绑定 <strong>{{ devices.length }}</strong> 台</span>
    </div>

    <div v-if="devices.length" class="device-list">
      <div v-for="device in devices" :key="device.id" class="device-card">
        <div class="device-icon">
          <Monitor :size="28" :stroke-width="1.5" />
        </div>
        <div class="device-info">
          <div class="device-name">{{ device.device_name || '未知设备' }}</div>
          <div class="device-meta">
            <span class="device-id">{{ device.device_id }}</span>
            <span class="bind-time">绑定于 {{ formatTime(device.created_at) }}</span>
          </div>
        </div>
        <button
          class="unbind-btn"
          @click="handleUnbind(device)"
          :disabled="devices.length <= 1 || unbinding"
          :title="devices.length <= 1 ? '至少保留一台设备' : '解绑此设备'"
        >
          {{ unbinding ? '解绑中...' : '解绑' }}
        </button>
      </div>
    </div>

    <div v-else class="empty-state">
      <Monitor :size="48" :stroke-width="1.5" />
      <p>暂无绑定设备</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getMyDevices, userUnbindDevice } from '@/utils/api'
import { showToast } from '@/utils'
import { AlertTriangle, Monitor } from '@lucide/vue'

const devices = ref([])
const maxDevices = ref(1)
const unbinding = ref(false)

function formatTime(timeStr) {
  if (!timeStr) return '-'
  const d = new Date(timeStr)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

async function loadDevices() {
  try {
    const userInfo = JSON.parse(localStorage.getItem('toolbox_user') || '{}')
    const userId = userInfo.user_id || userInfo.id
    if (!userId) {
      showToast('用户信息不存在', 'error')
      return
    }
    devices.value = await getMyDevices(userId)
    maxDevices.value = userInfo.max_devices || 1
  } catch (err) {
    showToast('设备列表加载失败', 'error')
  }
}

async function handleUnbind(device) {
  if (devices.value.length <= 1) {
    showToast('至少需要保留一台设备', 'warning')
    return
  }
  if (!confirm(`确定解绑设备 "${device.device_name || '未知设备'}" 吗？`)) return

  unbinding.value = true
  try {
    const userInfo = JSON.parse(localStorage.getItem('toolbox_user') || '{}')
    const userId = userInfo.user_id || userInfo.id
    await userUnbindDevice(device.id, userId)
    showToast('设备已解绑', 'success')
    await loadDevices()
  } catch (err) {
    showToast(err.message || '解绑失败', 'error')
  } finally {
    unbinding.value = false
  }
}

onMounted(loadDevices)
</script>

<style scoped>
.page-title {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  color: var(--studio-text-main);
  margin-bottom: 1.5rem;
}

.device-info-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: rgba(79, 70, 229, 0.06);
  border: 1px solid rgba(79, 70, 229, 0.15);
  border-radius: 12px;
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
  color: var(--studio-text-muted);
}

.device-info-banner svg { color: var(--studio-accent); flex-shrink: 0; }
.device-info-banner strong { color: var(--studio-accent); }

.device-list { display: flex; flex-direction: column; gap: 0.75rem; }

.device-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: var(--studio-surface);
  border-radius: 14px;
  border: 1px solid var(--color-border);
  transition: box-shadow 0.2s;
}
.device-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); }

.device-icon {
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(79, 70, 229, 0.08);
  border-radius: 12px;
  color: var(--studio-accent);
  flex-shrink: 0;
}

.device-info { flex: 1; min-width: 0; }
.device-name { font-weight: 600; font-size: 0.95rem; color: var(--studio-text-main); margin-bottom: 0.25rem; }
.device-meta { display: flex; gap: 1rem; font-size: 0.8rem; color: var(--studio-text-muted); flex-wrap: wrap; }
.device-id { font-family: monospace; }

.unbind-btn {
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--studio-text-muted);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.unbind-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.3);
  color: #EF4444;
}
.unbind-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 4rem 2rem; color: var(--studio-text-muted);
}
.empty-state p { margin-top: 1rem; }
</style>