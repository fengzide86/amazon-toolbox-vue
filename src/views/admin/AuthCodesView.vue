<template>
  <div>
    <h2 class="page-title">授权码管理</h2>

    <el-card class="table-card" style="margin-bottom: 1.5rem;">
      <template #header>
        <div class="card-header">
          <h3>生成新授权码</h3>
        </div>
      </template>
      <div class="generate-form">
        <el-select v-model="selectedPlanId" placeholder="选择套餐" style="max-width: 200px;">
          <el-option v-for="plan in plans" :key="plan.id" :label="`${plan.name} - ¥${plan.price}`" :value="plan.id" />
        </el-select>
        <el-select v-model="selectedPlatformScope" placeholder="平台权限" style="max-width: 160px;">
          <el-option label="亚马逊" value="amazon" />
          <el-option label="速卖通" value="aliexpress" />
          <el-option label="双平台" value="amazon,aliexpress" />
        </el-select>
        <el-select v-model="selectedSceneType" placeholder="场景类型" style="max-width: 120px;">
          <el-option label="比赛" value="competition" />
          <el-option label="课程" value="course" />
        </el-select>
        <el-input-number v-model="generateCount" :min="1" :max="100" placeholder="数量" style="width: 120px;" />
        <div class="device-input-group">
          <label>席位数</label>
          <el-input-number v-model="seatLimit" :min="1" :max="10" style="width: 100px;" />
        </div>
        <div class="device-input-group">
          <label>设备数</label>
          <el-input-number v-model="maxDevices" :min="1" :max="10" style="width: 100px;" />
        </div>
        <el-button type="primary" @click="handleGenerate" :loading="isLoading">
          {{ isLoading ? '生成中...' : '生成授权码' }}
        </el-button>
        <el-button v-if="generatedCodes.length" @click="copyCodes">
          📋 一键复制
        </el-button>
        <span v-if="generatedCodes.length" class="generated-count">
          已生成 {{ generatedCodes.length }} 个
        </span>
      </div>
      <div v-if="generatedCodes.length" class="generated-codes">
        <el-tag v-for="code in generatedCodes" :key="code" type="primary" effect="dark" class="code-tag">
          {{ code }}
        </el-tag>
      </div>
    </el-card>

    <el-card class="table-card">
      <template #header>
        <div class="card-header">
          <h3>授权码列表</h3>
          <div class="filter-bar">
            <el-input v-model="searchText" placeholder="搜索授权码/设备..." style="width: 200px;" clearable />
            <el-select v-model="filterStatus" placeholder="全部状态" clearable>
              <el-option label="未使用" value="unused" />
              <el-option label="已激活" value="active" />
              <el-option label="已冻结" value="frozen" />
              <el-option label="已过期" value="expired" />
            </el-select>
          </div>
        </div>
      </template>
      <div class="table-info">共 {{ filteredCodes.length }} 个</div>
      <el-table :data="filteredCodes" style="width: 100%" v-loading="isLoading">
        <el-table-column label="授权码" min-width="180">
          <template #default="{ row }">
            <a href="#" @click.prevent="openDetail(row)" class="code-link">{{ row.code }}</a>
          </template>
        </el-table-column>
        <el-table-column label="套餐" min-width="120">
          <template #default="{ row }">
            {{ row.plan_name || getPlanName(row.plan_id) }}
          </template>
        </el-table-column>
        <el-table-column label="平台权限" min-width="140">
          <template #default="{ row }">
            <el-tag v-for="p in (row.platform_scope || ['amazon'])" :key="p" 
                    :type="p === 'amazon' ? 'warning' : 'danger'" size="small" class="platform-tag">
              {{ p === 'amazon' ? '亚马逊' : '速卖通' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="席位" width="80">
          <template #default="{ row }">
            <span v-if="row.seat_limit" class="seat-badge">
              {{ row.seat_used || 0 }}/{{ row.seat_limit }}
            </span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="设备数" width="100">
          <template #default="{ row }">
            <el-tag :type="getDeviceType(row)" size="small" class="device-badge" 
                    @click="editMaxDevices(row)" style="cursor: pointer;">
              {{ row.device_used || getDeviceCount(row) }}/{{ row.max_devices || 1 }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="过期时间" width="120">
          <template #default="{ row }">
            <span class="text-small">{{ formatDate(row.expires_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">详情</el-button>
            <el-button size="small" @click="toggleFreeze(row)" :disabled="row.status === 'expired'">
              {{ row.status === 'frozen' ? '解冻' : '冻结' }}
            </el-button>
            <el-button size="small" @click="openExtend(row)" :disabled="row.status === 'deleted'">延期</el-button>
            <el-button size="small" type="danger" @click="deleteCode(row.id)" :disabled="row.status === 'deleted'">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-state">暂无数据</div>
        </template>
      </el-table>
    </el-card>

    <!-- 修改最大设备数弹窗 -->
    <el-dialog v-model="showDeviceModal" title="修改最大设备数" width="400px">
      <p class="dialog-info">授权码：{{ editingCode?.code }}</p>
      <div class="dialog-form-row">
        <label>最大设备数：</label>
        <el-input-number v-model="newMaxDevices" :min="1" :max="20" />
      </div>
      <template #footer>
        <el-button @click="showDeviceModal = false">取消</el-button>
        <el-button type="primary" @click="saveMaxDevices">确认</el-button>
      </template>
    </el-dialog>

    <!-- 延期弹窗 -->
    <el-dialog v-model="showExtendModal" title="授权码延期" width="400px">
      <p class="dialog-info">授权码：{{ extendingCode?.code }}</p>
      <p class="dialog-subtitle">当前过期时间：{{ formatDate(extendingCode?.expires_at) }}</p>
      <div class="dialog-form-row">
        <label>延期天数：</label>
        <el-input-number v-model="extendDays" :min="1" :max="365" />
      </div>
      <template #footer>
        <el-button @click="showExtendModal = false">取消</el-button>
        <el-button type="primary" @click="confirmExtend">确认延期</el-button>
      </template>
    </el-dialog>

    <!-- 授权码详情弹窗 -->
    <el-dialog v-model="showDetailModal" title="授权码详情" width="520px">
      <div v-if="detailData" class="detail-grid">
        <div class="detail-row">
          <span class="detail-label">授权码</span>
          <span class="detail-value" style="font-family: monospace;">{{ detailData.code }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">套餐</span>
          <span class="detail-value">{{ detailData.plan_name || getPlanName(detailData.plan_id) }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">状态</span>
          <span class="detail-value">
            <el-tag :type="getStatusType(detailData.status)" size="small">
              {{ getStatusText(detailData.status) }}
            </el-tag>
          </span>
        </div>
        <div class="detail-row">
          <span class="detail-label">平台权限</span>
          <span class="detail-value">
            <el-tag v-for="p in (detailData.platform_scope || ['amazon'])" :key="p" 
                    :type="p === 'amazon' ? 'warning' : 'danger'" size="small" class="platform-tag">
              {{ p === 'amazon' ? '亚马逊' : '速卖通' }}
            </el-tag>
          </span>
        </div>
        <div class="detail-row">
          <span class="detail-label">场景类型</span>
          <span class="detail-value">{{ detailData.scene_type || '-' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">席位</span>
          <span class="detail-value"><strong>{{ detailData.seat_used || 0 }}</strong> / {{ detailData.seat_limit || '-' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">设备数</span>
          <span class="detail-value"><strong>{{ detailData.device_used || 0 }}</strong> / {{ detailData.max_devices || '-' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">过期时间</span>
          <span class="detail-value">{{ formatDate(detailData.expires_at) }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">创建时间</span>
          <span class="detail-value">{{ formatDate(detailData.created_at) }}</span>
        </div>
        <div v-if="detailData.devices && detailData.devices.length" class="detail-section">
          <div class="detail-label" style="margin-bottom: 0.5rem;">绑定设备</div>
          <div v-for="dev in detailData.devices" :key="dev.id" class="device-item">
            {{ dev.device_name || dev.device_id }} 
            <span class="text-muted text-small">{{ formatDate(dev.created_at) }}</span>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">加载中...</div>
      <template #footer>
        <el-button @click="showDetailModal = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { getAuthCodes, batchGenerateAuthCodes, updateAuthCode, deleteAuthCode, getPlans, api } from '@/utils/api'
import { showToast } from '@/utils'
import { usePlatformStore } from '@/stores/platform'

const authCodes = ref([])
const plans = ref([])
const selectedPlanId = ref(2)
const selectedPlatformScope = ref('amazon')
const selectedSceneType = ref('competition')
const generateCount = ref(1)
const seatLimit = ref(1)
const maxDevices = ref(1)
const isLoading = ref(false)
const generatedCodes = ref([])
const filterStatus = ref('')
const searchText = ref('')
const planNameMap = {}

const platformStore = usePlatformStore()

// 设备数弹窗
const showDeviceModal = ref(false)
const editingCode = ref(null)
const newMaxDevices = ref(1)

// 延期弹窗
const showExtendModal = ref(false)
const extendingCode = ref(null)
const extendDays = ref(30)

// 详情弹窗
const showDetailModal = ref(false)
const detailData = ref(null)

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

function getStatusType(status) {
  const map = { unused: 'warning', active: 'success', frozen: 'info', expired: 'danger' }
  return map[status] || 'info'
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

function getDeviceType(code) {
  const count = getDeviceCount(code)
  const max = code.max_devices || 1
  if (count >= max) return 'danger'
  if (count > 0) return 'success'
  return 'info'
}

function editMaxDevices(code) {
  editingCode.value = code
  newMaxDevices.value = code.max_devices || 1
  showDeviceModal.value = true
}

async function saveMaxDevices() {
  if (newMaxDevices.value < 1) {
    showToast('设备数不能小于1', 'error')
    return
  }
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
    const platformKey = platformStore.adminPlatform !== 'all' ? platformStore.adminPlatform : undefined
    const params = platformKey ? { platform_key: platformKey } : {}
    const [codesRes, plansRes] = await Promise.all([getAuthCodes(params), getPlans()])
    authCodes.value = codesRes
    plans.value = plansRes
    if (plansRes.length) selectedPlanId.value = plansRes[0].id
    plansRes.forEach(p => { planNameMap[p.id] = p.name })
  } catch (err) {
    showToast('数据加载失败', 'error')
  }
}

watch(() => platformStore.adminPlatform, () => { loadData() })

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
      platform_scope: selectedPlatformScope.value,
      scene_type: selectedSceneType.value,
      seat_limit: seatLimit.value,
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

async function openDetail(code) {
  try {
    const res = await api.get(`/auth-codes/${code.id}`)
    detailData.value = res.data
    showDetailModal.value = true
  } catch (err) {
    showToast('获取详情失败', 'error')
  }
}

onMounted(loadData)
</script>

<style scoped>
.page-title {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--studio-text-main);
  margin-bottom: 1.5rem;
}

.table-card {
  background: var(--studio-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--studio-shadow);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--studio-text-main);
  margin: 0;
}

.generate-form {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1rem 0;
}

.device-input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.device-input-group label {
  font-size: 0.85rem;
  color: var(--studio-text-muted);
  white-space: nowrap;
}

.generated-count {
  font-size: 0.85rem;
  color: var(--studio-accent);
  font-weight: 600;
}

.filter-bar {
  display: flex;
  gap: 0.75rem;
}

.table-info {
  padding: 0.75rem 0;
  font-size: 0.85rem;
  color: var(--studio-text-muted);
}

.code-link {
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--studio-text-main);
  text-decoration: none;
  font-weight: 500;
}

.code-link:hover {
  color: var(--studio-accent);
}

.platform-tag {
  margin-right: 0.25rem;
}

.seat-badge {
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(16, 185, 129, 0.1);
  color: #10B981;
}

.device-badge {
  cursor: pointer;
}

.text-muted {
  color: var(--studio-text-muted);
}

.text-small {
  font-size: 0.8rem;
}

.generated-codes {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--studio-bg);
  border-radius: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.code-tag {
  font-family: monospace;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--studio-text-muted);
}

.dialog-info {
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--studio-text-muted);
  margin-bottom: 1rem;
}

.dialog-subtitle {
  font-size: 0.85rem;
  color: var(--studio-text-muted);
  margin-bottom: 1rem;
}

.dialog-form-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1rem 0;
}

.dialog-form-row label {
  font-size: 0.9rem;
  color: var(--studio-text-main);
  white-space: nowrap;
}

.detail-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-row {
  display: flex;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  width: 100px;
  font-size: 0.85rem;
  color: var(--studio-text-muted);
  flex-shrink: 0;
}

.detail-value {
  flex: 1;
  font-size: 0.9rem;
  color: var(--studio-text-main);
}

.detail-section {
  margin-top: 1rem;
}

.device-item {
  padding: 0.5rem;
  background: var(--studio-bg);
  border-radius: 6px;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}

:deep(.el-table) {
  --el-table-border-color: var(--color-border);
  --el-table-header-bg-color: var(--studio-bg);
  --el-table-row-hover-bg-color: var(--studio-bg);
}

:deep(.el-card__header) {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

:deep(.el-card__body) {
  padding: 1.25rem;
}
</style>