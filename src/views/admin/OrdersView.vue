<template>
  <div>
    <h2 class="page-title">订单管理</h2>

    <el-row :gutter="16" style="margin-bottom: 1.5rem;">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-label">总订单数</div>
          <div class="stat-value" style="color: var(--studio-accent);">{{ stats.total }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-label">已付款</div>
          <div class="stat-value">{{ stats.paid }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-label">待确认</div>
          <div class="stat-value" style="color: var(--studio-warning);">{{ stats.pending }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-label">已退款</div>
          <div class="stat-value" style="color: var(--studio-danger);">{{ stats.refunded }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 创建订单 -->
    <el-card class="table-card" style="margin-bottom: 1.5rem;">
      <template #header>
        <div class="card-header">
          <h3>创建新订单</h3>
        </div>
      </template>
      <div class="form-row">
        <el-select v-model="newOrder.plan_id" placeholder="选择套餐" style="width: 200px;">
          <el-option v-for="plan in plans" :key="plan.id" :label="`${plan.name} - ¥${plan.price}`" :value="plan.id" />
        </el-select>
        <el-input v-model="newOrder.channel" placeholder="渠道（如微信/支付宝）" style="width: 200px;" />
        <el-input v-model="newOrder.responsible" placeholder="负责人" style="width: 120px;" />
        <el-select v-model="newOrder.status" style="width: 120px;">
          <el-option label="待确认" value="pending" />
          <el-option label="已付款" value="paid" />
        </el-select>
        <el-button type="primary" @click="createOrder" :loading="isLoading">
          {{ isLoading ? '创建中...' : '创建订单' }}
        </el-button>
      </div>
    </el-card>

    <el-card class="table-card">
      <template #header>
        <div class="card-header">
          <h3>全部订单</h3>
          <div class="filter-bar">
            <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 120px;">
              <el-option label="已付款" value="paid" />
              <el-option label="待确认" value="pending" />
              <el-option label="已退款" value="refunded" />
            </el-select>
            <el-button @click="exportOrdersData">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              导出 CSV
            </el-button>
          </div>
        </div>
      </template>
      <el-table :data="filteredOrders" style="width: 100%">
        <el-table-column label="订单号" min-width="140">
          <template #default="{ row }">
            <span style="font-family: monospace; font-size: 0.85rem;">{{ row.order_no }}</span>
          </template>
        </el-table-column>
        <el-table-column label="套餐" min-width="120">
          <template #default="{ row }">
            {{ getPlanName(row.plan_id) }}
          </template>
        </el-table-column>
        <el-table-column label="金额" width="100">
          <template #default="{ row }">
            ¥{{ row.amount }}
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="120">
          <template #default="{ row }">
            {{ row.channel || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="负责人" width="120">
          <template #default="{ row }">
            {{ row.responsible || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="140">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" size="small" @click="markPaid(row)">确认付款</el-button>
            <el-button v-if="row.status === 'paid'" size="small" type="danger" @click="refund(row)">退款</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-state">暂无订单</div>
        </template>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { getOrders, createOrder as apiCreateOrder, updateOrder, refundOrder, getPlans, exportOrders, API_BASE } from '@/utils/api'
import { showToast } from '@/utils'
import { usePlatformStore } from '@/stores/platform'

const orders = ref([])
const plans = ref([])
const isLoading = ref(false)
const filterStatus = ref('')
const planNameMap = {}

const platformStore = usePlatformStore()

const newOrder = ref({ plan_id: null, amount: 0, channel: '', responsible: '', status: 'pending' })

const stats = computed(() => ({
  total: orders.value.length,
  paid: orders.value.filter(o => o.status === 'paid').length,
  pending: orders.value.filter(o => o.status === 'pending').length,
  refunded: orders.value.filter(o => o.status === 'refunded').length,
}))

const filteredOrders = computed(() => {
  if (!filterStatus.value) return orders.value
  return orders.value.filter(o => o.status === filterStatus.value)
})

function getPlanName(planId) {
  return planNameMap[planId] || '未知套餐'
}

function getStatusType(status) {
  const map = { pending: 'warning', paid: 'success', refunded: 'danger' }
  return map[status] || 'info'
}

function getStatusText(status) {
  const map = { pending: '待确认', paid: '已完成', refunded: '已退款' }
  return map[status] || status
}

function formatTime(timeStr) {
  if (!timeStr) return '-'
  const d = new Date(timeStr)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

async function loadData() {
  try {
    const platformKey = platformStore.adminPlatform !== 'all' ? platformStore.adminPlatform : undefined
    const params = platformKey ? { platform_key: platformKey } : {}
    const [ordersRes, plansRes] = await Promise.all([getOrders(params), getPlans()])
    orders.value = ordersRes
    plans.value = plansRes
    if (plansRes.length && !newOrder.value.plan_id) {
      newOrder.value.plan_id = plansRes[0].id
      newOrder.value.amount = plansRes[0].price
    }
    plansRes.forEach(p => { planNameMap[p.id] = p.name })
  } catch (err) {
    showToast('数据加载失败', 'error')
  }
}

watch(() => platformStore.adminPlatform, () => { loadData() })

async function createOrder() {
  if (!newOrder.value.plan_id) { showToast('请选择套餐', 'error'); return }
  if (!newOrder.value.amount || newOrder.value.amount <= 0) { showToast('订单金额必须大于0', 'error'); return }
  isLoading.value = true
  try {
    await apiCreateOrder(newOrder.value)
    showToast('订单创建成功', 'success')
    await loadData()
  } catch (err) {
    showToast('创建失败', 'error')
  }
  isLoading.value = false
}

async function markPaid(order) {
  try {
    await updateOrder(order.id, { status: 'paid' })
    showToast('已确认付款', 'success')
    await loadData()
  } catch (err) {
    showToast('操作失败', 'error')
  }
}

async function refund(order) {
  if (!confirm(`确定退款 ¥${order.amount} 吗？`)) return
  try {
    await refundOrder(order.id)
    showToast('退款成功', 'success')
    await loadData()
  } catch (err) {
    showToast('退款失败', 'error')
  }
}

// 选择套餐时自动填充金额
watch(() => newOrder.value.plan_id, (id) => {
  const plan = plans.value.find(p => p.id === id)
  if (plan) newOrder.value.amount = plan.price
})

async function exportOrdersData() {
  try {
    const params = {}
    if (filterStatus.value) params.status = filterStatus.value
    const blob = await exportOrders(params)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orders_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('导出成功', 'success')
  } catch (err) {
    showToast('导出失败', 'error')
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

.stat-card {
  text-align: center;
}

.stat-label {
  font-size: 0.85rem;
  color: var(--studio-text-muted);
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--studio-text-main);
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

.form-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: center;
}

.filter-bar {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--studio-text-muted);
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