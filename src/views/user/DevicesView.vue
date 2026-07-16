<template>
  <div class="devices-page">
    <header class="devices-header">
      <span>本机授权</span>
      <h2 class="page-title">设备授权</h2>
      <p>查看当前电脑是否已获得使用权限，必要时可管理其他已绑定设备。</p>
    </header>

    <div class="device-info-banner">
      <CircleCheck v-if="currentDeviceBound" :size="21" />
      <AlertTriangle v-else :size="21" />
      <div>
        <strong>{{ currentDeviceBound ? '当前电脑已授权' : '未识别到当前电脑授权' }}</strong>
        <span>{{ currentDeviceBound ? '你可以在这台电脑上正常使用已开通的工具。' : '如刚完成换绑，请重新登录；仍未恢复可联系工具帮助。' }}</span>
      </div>
      <small>已绑定 {{ devices.length }} / {{ maxDevices }} 台</small>
    </div>

    <div v-if="devices.length" class="device-list">
      <div v-for="device in devices" :key="device.id" class="device-card">
        <div class="device-icon">
          <Monitor :size="28" :stroke-width="1.5" />
        </div>
        <div class="device-info">
          <div class="device-name">{{ device.device_name || '未知设备' }} <span v-if="isCurrentDevice(device)">当前电脑</span></div>
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
import { computed, ref, onMounted } from 'vue'
import { getMyDevices, userUnbindDevice } from '@/utils/api'
import { getDeviceId, showToast } from '@/utils'
import { AlertTriangle, CircleCheck, Monitor } from '@lucide/vue'

const devices = ref([])
const maxDevices = ref(1)
const unbinding = ref(false)
const currentDeviceId = getDeviceId()
const currentDeviceBound = computed(() => devices.value.some(isCurrentDevice))

function isCurrentDevice(device) {
  return Boolean(currentDeviceId && device.device_id === currentDeviceId)
}

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
.devices-page { width: min(980px, 100%); margin: 0 auto; }
.devices-header { margin-bottom: 22px; }
.devices-header > span { display: block; margin-bottom: 8px; color: var(--color-primary); font-size:var(--type-meta); font-weight: 800; letter-spacing: .12em; }
.devices-header h2 { margin: 0; color: var(--color-text); font-size: var(--font-page-title); letter-spacing: -.03em; }
.devices-header p { margin: 8px 0 0; color: var(--color-text-secondary); font-size: 13px; }

.device-info-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: var(--color-primary-soft);
  border: 1px solid rgba(45, 95, 202, .12);
  border-radius: 12px;
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
  color: var(--color-primary);
}

.device-info-banner svg { color: var(--studio-accent); flex-shrink: 0; }
.device-info-banner div { flex: 1; min-width: 0; }
.device-info-banner strong,
.device-info-banner span { display: block; }
.device-info-banner strong { color: var(--color-text); font-size: 14px; }
.device-info-banner span { margin-top: 3px; color: var(--color-text-secondary); font-size:var(--type-meta); }
.device-info-banner small { color: var(--color-text-secondary); white-space: nowrap; }

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
.device-card:hover { box-shadow: var(--shadow-medium); border-color: var(--color-border-strong); }

.device-icon {
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-primary-soft);
  border-radius: 12px;
  color: var(--studio-accent);
  flex-shrink: 0;
}

.device-info { flex: 1; min-width: 0; }
.device-name { font-weight: 600; font-size: 0.95rem; color: var(--studio-text-main); margin-bottom: 0.25rem; }
.device-name span { margin-left: 7px; padding: 3px 7px; border-radius: 999px; color: var(--color-success); background: var(--color-success-soft); font-size:var(--type-micro); }
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
  background: var(--color-danger-soft);
  border-color: rgba(195, 61, 73, .28);
  color: var(--studio-danger);
}
.unbind-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 4rem 2rem; color: var(--studio-text-muted);
}
.empty-state p { margin-top: 1rem; }
</style>
