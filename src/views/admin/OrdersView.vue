<template>
  <div>
    <h2 class="page-title">订单管理</h2>

    <section class="stats-row" style="margin-bottom: 1.5rem;">
      <article class="stat-card">
        <div class="stat-label">总订单数</div>
        <div class="stat-value" style="color: var(--color-accent);">{{ stats.total }}</div>
      </article>
      <article class="stat-card">
        <div class="stat-label">已付款</div>
        <div class="stat-value">{{ stats.paid }}</div>
      </article>
      <article class="stat-card">
        <div class="stat-label">待确认</div>
        <div class="stat-value" style="color: var(--color-gold);">{{ stats.pending }}</div>
      </article>
      <article class="stat-card">
        <div class="stat-label">已退款</div>
        <div class="stat-value" style="color: var(--color-destructive);">{{ stats.refunded }}</div>
      </article>
    </section>

    <!-- 创建订单 -->
    <div class="table-card" style="margin-bottom: 1.5rem;">
      <div class="table-header">
        <h3>创建新订单</h3>
      </div>
      <div class="form-row">
        <select v-model="newOrder.plan_id" class="form-input">
          <option v-for="plan in plans" :key="plan.id" :value="plan.id">{{ plan.name }} - ¥{{ plan.price }}</option>
        </select>
        <input v-model="newOrder.channel" class="form-input" placeholder="渠道（如微信/支付宝）">
        <input v-model="newOrder.responsible" class="form-input" placeholder="负责人" style="width: 120px;">
        <select v-model="newOrder.status" class="form-input">
          <option value="pending">待确认</option>
          <option value="paid">已付款</option>
        </select>
        <button class="btn btn-primary" @click="createOrder" :disabled="isLoading">
          {{ isLoading ? '创建中...' : '创建订单' }}
        </button>
      </div>
    </div>

    <section class="table-card">
      <div class="table-header">
        <h3>全部订单</h3>
        <div class="filter-bar">
          <select v-model="filterStatus" class="form-input">
            <option value="">全部状态</option>
            <option value="paid">已付款</option>
            <option value="pending">待确认</option>
            <option value="refunded">已退款</option>
          </select>
          <button class="btn btn-secondary btn-sm" @click="exportOrdersData">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            导出 CSV
          </button>
        </div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">订单号</th>
            <th scope="col">套餐</th>
            <th scope="col">金额</th>
            <th scope="col">渠道</th>
            <th scope="col">负责人</th>
            <th scope="col">状态</th>
            <th scope="col">创建时间</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in filteredOrders" :key="order.id">
            <td style="font-family:monospace;font-size:0.85rem">{{ order.order_no }}</td>
            <td>{{ getPlanName(order.plan_id) }}</td>
            <td>¥{{ order.amount }}</td>
            <td>{{ order.channel || '-' }}</td>
            <td>{{ order.responsible || '-' }}</td>
            <td>
              <span :class="['status-dot', order.status]"></span>
              {{ getStatusText(order.status) }}
            </td>
            <td>{{ formatTime(order.created_at) }}</td>
            <td>
              <button v-if="order.status === 'pending'" class="btn btn-secondary btn-table"
                @click="markPaid(order)">确认付款</button>
              <button v-if="order.status === 'paid'" class="btn btn-secondary btn-table" style="color: var(--color-destructive);"
                @click="refund(order)">退款</button>
            </td>
          </tr>
          <tr v-if="!filteredOrders.length">
            <td colspan="8" class="empty-row">暂无订单</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getOrders, createOrder as apiCreateOrder, updateOrder, refundOrder, getPlans, exportOrders, API_BASE } from '@/utils/api'
import { showToast } from '@/utils'

const orders = ref([])
const plans = ref([])
const isLoading = ref(false)
const filterStatus = ref('')
const planNameMap = {}

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
    const [ordersRes, plansRes] = await Promise.all([getOrders(), getPlans()])
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
import { watch } from 'vue'
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
