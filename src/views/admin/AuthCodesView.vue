<template>
  <div>
    <h2 class="page-title">授权码管理</h2>

    <div class="table-card" style="margin-bottom: 1.5rem;">
      <div class="table-header">
        <h3>生成新授权码</h3>
      </div>
      <div class="generate-form">
        <select v-model="selectedPlanId" class="form-input" style="max-width: 200px;">
          <option v-for="plan in plans" :key="plan.id" :value="plan.id">{{ plan.name }} - ¥{{ plan.price }}</option>
        </select>
        <input type="number" v-model.number="generateCount" class="form-input" placeholder="数量" style="width: 120px;" min="1" max="100">
        <div class="device-input-group">
          <label>最大设备数</label>
          <input type="number" v-model.number="maxDevices" class="form-input" style="width:80px;" min="1" max="10">
        </div>
        <button class="btn btn-primary" @click="handleGenerate" :disabled="isLoading">
          {{ isLoading ? '生成中...' : '生成授权码' }}
        </button>
        <button v-if="generatedCodes.length" class="btn btn-secondary" @click="copyCodes">
          📋 一键复制
        </button>
        <span v-if="generatedCodes.length" class="generated-count">
          已生成 {{ generatedCodes.length }} 个
        </span>
      </div>
      <div v-if="generatedCodes.length" class="generated-codes">
        <div v-for="code in generatedCodes" :key="code" class="code-tag">{{ code }}</div>
      </div>
    </div>

    <section class="table-card">
      <div class="table-header">
        <h3>授权码列表</h3>
        <div class="filter-bar">
          <input v-model="searchText" class="form-input" placeholder="搜索授权码/设备..." style="width:180px;">
          <select v-model="filterStatus" class="form-input">
            <option value="">全部状态</option>
            <option value="unused">未使用</option>
            <option value="active">已激活</option>
            <option value="frozen">已冻结</option>
            <option value="expired">已过期</option>
          </select>
        </div>
      </div>
      <span class="text-muted" style="padding: 0 1rem;">共 {{ filteredCodes.length }} 个</span>
      <table class="data-table">
        <thead>
          <tr>
            <th>授权码</th>
            <th>套餐</th>
            <th>状态</th>
            <th>绑定设备</th>
            <th>设备数</th>
            <th>过期时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="code in filteredCodes" :key="code.id">
            <td style="font-family:monospace;font-size:0.85rem">{{ code.code }}</td>
            <td>{{ getPlanName(code.plan_id) }}</td>
            <td><span :class="['status-dot', getStatusClass(code.status)]"></span>{{ getStatusText(code.status) }}</td>
            <td style="font-size:0.8rem;">{{ code.device_name || '未绑定' }}</td>
            <td>
              <span class="device-badge" :class="getDeviceClass(code)" @click="editMaxDevices(code)" title="点击修改">
                {{ getDeviceCount(code) }}/{{ code.max_devices || 1 }}
              </span>
            </td>
            <td style="font-size:0.8rem;">{{ formatDate(code.expires_at) }}</td>
            <td>
              <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; margin-right: 0.3rem;"
                @click="toggleFreeze(code)" :disabled="code.status === 'expired'">
                {{ code.status === 'frozen' ? '解冻' : '冻结' }}
              </button>
              <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; margin-right: 0.3rem;"
                @click="openExtend(code)" :disabled="code.status === 'deleted'">
                延期
              </button>
              <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; color: var(--color-destructive);"
                @click="deleteCode(code.id)" :disabled="code.status === 'deleted'">
                删除
              </button>
            </td>
          </tr>
          <tr v-if="!filteredCodes.length">
            <td colspan="7" style="text-align:center;color:var(--color-muted);padding:2rem;">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 修改最大设备数弹窗 -->
    <div class="modal-overlay" :class="{ show: showDeviceModal }" @click.self="showDeviceModal = false">
      <div class="modal">
        <h3>修改最大设备数</h3>
        <p>授权码：{{ editingCode?.code }}</p>
        <div class="modal-form-row">
          <label>最大设备数：</label>
          <input v-model.number="newMaxDevices" type="number" min="1" max="20" class="form-input modal-input">
        </div>
        <div class="modal-btns">
          <button class="btn btn-primary" @click="saveMaxDevices">确认</button>
          <button class="btn btn-secondary" @click="showDeviceModal = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 延期弹窗 -->
    <div class="modal-overlay" :class="{ show: showExtendModal }" @click.self="showExtendModal = false">
      <div class="modal">
        <h3>授权码延期</h3>
        <p>授权码：{{ extendingCode?.code }}</p>
        <p class="modal-subtitle">
          当前过期时间：{{ formatDate(extendingCode?.expires_at) }}
        </p>
        <div class="modal-form-row">
          <label>延期天数：</label>
          <input v-model.number="extendDays" type="number" min="1" max="365" class="form-input modal-input">
        </div>
        <div class="modal-btns">
          <button class="btn btn-primary" @click="confirmExtend">确认延期</button>
          <button class="btn btn-secondary" @click="showExtendModal = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getAuthCodes, batchGenerateAuthCodes, updateAuthCode, deleteAuthCode, getPlans, api } from '@/utils/api'
import { showToast } from '@/utils'

const authCodes = ref([])
const plans = ref([])
const selectedPlanId = ref(2)
const generateCount = ref(1)
const maxDevices = ref(1)
const isLoading = ref(false)
const generatedCodes = ref([])
const filterStatus = ref('')
const searchText = ref('')
const planNameMap = {}

// 设备数弹窗
const showDeviceModal = ref(false)
const editingCode = ref(null)
const newMaxDevices = ref(1)

// 延期弹窗
const showExtendModal = ref(false)
const extendingCode = ref(null)
const extendDays = ref(30)

const filteredCodes = computed(() => {
  let codes = authCodes.value
  if (filterStatus.value) {
    codes = codes.filter(c => c.status === filterStatus.value)
  }
  if (searchText.value) {
    const q = searchText.value.toLowerCase()
    codes = codes.filter(c =>
      c.code.toLowerCase().includes(q) ||
      (c.device_name && c.device_name.toLowerCase().includes(q))
    )
  }
  return codes
})

function getPlanName(planId) {
  return planNameMap[planId] || '未关联套餐'
}

function getStatusClass(status) {
  const map = { unused: 'warning', active: 'success', frozen: 'error', expired: 'error' }
  return map[status] || 'warning'
}

function getStatusText(status) {
  const map = { unused: '未使用', active: '已激活', frozen: '已冻结', expired: '已过期' }
  return map[status] || status
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function getDeviceCount(code) {
  return code.devices?.length || (code.device_name ? 1 : 0)
}

function getDeviceClass(code) {
  const count = getDeviceCount(code)
  const max = code.max_devices || 1
  if (count >= max) return 'device-full'
  if (count > 0) return 'device-partial'
  return 'device-empty'
}

function editMaxDevices(code) {
  editingCode.value = code
  newMaxDevices.value = code.max_devices || 1
  showDeviceModal.value = true
}

async function saveMaxDevices() {
  if (newMaxDevices.value < 1) { showToast('设备数不能小于1', 'error'); return }
  try {
    await updateAuthCode(editingCode.value.id, { max_devices: newMaxDevices.value })
    showToast('设备数已更新', 'success')
    showDeviceModal.value = false
    await loadData()
  } catch (err) {
    showToast('更新失败', 'error')
  }
}

async function loadData() {
  try {
    const [codesRes, plansRes] = await Promise.all([getAuthCodes(), getPlans()])
    authCodes.value = codesRes
    plans.value = plansRes
    if (plansRes.length) selectedPlanId.value = plansRes[0].id
    plansRes.forEach(p => { planNameMap[p.id] = p.name })
  } catch (err) {
    showToast('数据加载失败', 'error')
  }
}

async function handleGenerate() {
  if (!generateCount.value || generateCount.value < 1) {
    showToast('请输入生成数量', 'error')
    return
  }
  isLoading.value = true
  try {
    const res = await batchGenerateAuthCodes({
      plan_id: selectedPlanId.value,
      count: generateCount.value,
      max_devices: maxDevices.value
    })
    if (res.success) {
      generatedCodes.value = res.codes
      showToast(`成功生成 ${res.count} 个授权码`, 'success')
      await loadData()
    }
  } catch (err) {
    showToast('生成失败', 'error')
  }
  isLoading.value = false
}

async function toggleFreeze(code) {
  const newStatus = code.status === 'frozen' ? 'active' : 'frozen'
  try {
    await updateAuthCode(code.id, { status: newStatus })
    showToast(newStatus === 'frozen' ? '已冻结' : '已解冻', 'success')
    await loadData()
  } catch (err) {
    showToast('操作失败', 'error')
  }
}

function openExtend(code) {
  extendingCode.value = code
  extendDays.value = 30
  showExtendModal.value = true
}

async function confirmExtend() {
  if (!extendDays.value || extendDays.value < 1) {
    showToast('请输入有效天数', 'error')
    return
  }
  try {
    const baseDate = extendingCode.value.expires_at ? new Date(extendingCode.value.expires_at) : new Date()
    const startDate = baseDate < new Date() ? new Date() : baseDate
    startDate.setDate(startDate.getDate() + parseInt(extendDays.value))
    await updateAuthCode(extendingCode.value.id, { expires_at: startDate.toISOString() })
    if (extendingCode.value.status === 'expired') {
      await updateAuthCode(extendingCode.value.id, { status: 'active' })
    }
    showToast(`已延期 ${extendDays.value} 天`, 'success')
    showExtendModal.value = false
    await loadData()
  } catch (err) {
    showToast('延期失败', 'error')
  }
}

async function deleteCode(id) {
  if (!confirm('确定要删除此授权码吗？')) return
  try {
    await deleteAuthCode(id)
    showToast('已删除', 'success')
    await loadData()
  } catch (err) {
    showToast('删除失败', 'error')
  }
}

function copyCodes() {
  const text = generatedCodes.value.join('\n')
  navigator.clipboard.writeText(text).then(() => {
    showToast('授权码已复制到剪贴板', 'success')
  }).catch(() => {
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    showToast('授权码已复制到剪贴板', 'success')
  })
}

onMounted(loadData)
</script>

<style scoped>
.generate-form {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1rem;
}

.device-input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.device-input-group label {
  font-size: 0.85rem;
  color: var(--color-muted);
  white-space: nowrap;
}

.generated-count {
  font-size: 0.85rem;
  color: var(--color-accent);
}

.filter-bar { padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border); }
.generated-codes { margin-top: 1rem; padding: 1rem; background: #f0f9ff; border-radius: 12px; display: flex; flex-wrap: wrap; gap: 0.5rem; }
.code-tag { padding: 0.4rem 0.8rem; background: var(--color-accent); color: white; border-radius: 6px; font-family: monospace; font-size: 0.85rem; }
.device-badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; cursor: pointer; }
.device-empty { background: rgba(100,116,139,0.1); color: var(--color-muted); }
.device-partial { background: rgba(16,185,129,0.1); color: #10B981; }
.device-full { background: rgba(239,68,68,0.1); color: #EF4444; }
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(15,23,42,0.5); backdrop-filter: blur(5px); z-index: 1000; align-items: center; justify-content: center; }
.modal-overlay.show { display: flex; }
.modal { background: white; border-radius: 20px; padding: 2rem; max-width: 400px; width: 90%; box-shadow: 0 25px 50px rgba(0,0,0,0.15); }
.modal h3 { font-family: var(--font-heading); font-size: 1.1rem; margin-bottom: 0.5rem; color: var(--color-primary); }
.modal p { color: var(--color-muted); font-size: 0.85rem; font-family: monospace; }
.modal-btns { display: flex; gap: 0.75rem; margin-top: 1rem; }
.modal-btns button { flex: 1; padding: 0.75rem; border-radius: 10px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
</style>