<template>
  <div>
    <h2 style="font-family: var(--font-heading); font-size: 1.875rem; font-weight: 700; color: var(--color-primary); margin-bottom: 1.5rem;">
      数据总览
    </h2>

    <!-- 统计卡片 -->
    <section class="stats-row">
      <article class="stat-card">
        <div class="stat-icon" style="background: rgba(14,165,233,0.1);">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div class="stat-content">
          <div class="stat-label">总收入</div>
          <div class="stat-value" style="color: var(--studio-accent);">¥{{ dashboardData.total_revenue?.toFixed(2) || '0.00' }}</div>
          <div class="stat-sub">{{ dashboardData.total_orders || 0 }} 笔订单</div>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon" style="background: rgba(16,185,129,0.1);">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
        </div>
        <div class="stat-content">
          <div class="stat-label">活跃授权码</div>
          <div class="stat-value" style="color: var(--studio-success);">{{ dashboardData.active_codes || 0 }}</div>
          <div class="stat-sub">总用户 {{ dashboardData.total_users || 0 }}</div>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon" style="background: rgba(245,158,11,0.1);">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        </div>
        <div class="stat-content">
          <div class="stat-label">待处理工单</div>
          <div class="stat-value" style="color: var(--studio-warning);">{{ dashboardData.pending_tickets || 0 }}</div>
          <div class="stat-sub">需要及时处理</div>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon" style="background: rgba(6,182,212,0.1);">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <div class="stat-content">
          <div class="stat-label">今日运行次数</div>
          <div class="stat-value" style="color: var(--studio-info);">{{ dashboardData.today_runs || 0 }}</div>
          <div class="stat-sub">今日工具使用</div>
        </div>
      </article>
    </section>

    <!-- 图表区域 -->
    <section class="charts-grid">
      <div class="chart-card">
        <div class="chart-header">
          <h3>收入趋势（近7天）</h3>
        </div>
        <div class="chart-container">
          <LineChart v-if="chartsLoaded" :data="lineChartData" :options="lineChartOptions" />
          <div v-else class="chart-loading">加载中...</div>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>套餐销售分布</h3>
        </div>
        <div class="chart-container">
          <DoughnutChart v-if="chartsLoaded" :data="doughnutChartData" :options="doughnutChartOptions" />
          <div v-else class="chart-loading">加载中...</div>
        </div>
      </div>
      <div class="chart-card" style="grid-column: 1 / -1;">
        <div class="chart-header">
          <h3>工具成功率</h3>
        </div>
        <div class="chart-container" style="max-height: 250px;">
          <BarChart v-if="chartsLoaded" :data="barChartData" :options="barChartOptions" />
          <div v-else class="chart-loading">加载中...</div>
        </div>
      </div>
    </section>

    <!-- 最近订单 -->
    <section class="table-card">
      <div class="table-header">
        <h3>最近订单</h3>
        <router-link to="/admin/orders" class="view-all-link">查看全部 →</router-link>
      </div>
      <el-table :data="recentOrders" style="width: 100%" class="studio-table" size="small">
        <el-table-column label="订单号" min-width="140">
          <template #default="{ row }">
            <span style="font-family:monospace;font-size:0.85rem">{{ row.order_no }}</span>
          </template>
        </el-table-column>
        <el-table-column label="套餐" min-width="100">
          <template #default="{ row }">{{ getPlanName(row.plan_id) }}</template>
        </el-table-column>
        <el-table-column label="金额" width="100">
          <template #default="{ row }">¥{{ row.amount }}</template>
        </el-table-column>
        <el-table-column label="渠道" width="100">
          <template #default="{ row }">{{ row.channel || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'paid' ? 'success' : row.status === 'pending' ? 'warning' : 'danger'" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="120">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <template #empty>
          <div class="empty-row">暂无订单数据</div>
        </template>
      </el-table>
    </section>

    <!-- 最近运行日志 -->
    <section class="table-card" style="margin-top: 1.5rem;">
      <div class="table-header">
        <h3>最近运行日志</h3>
      </div>
      <div v-if="dashboardData.recent_logs?.length" class="log-list">
        <div v-for="log in dashboardData.recent_logs" :key="log.id" class="log-item">
          <span class="log-tool">{{ log.tool_name || '未知工具' }}</span>
          <span class="log-module">{{ log.module || '-' }}</span>
          <span :class="['log-badge', log.status === 'success' ? 'log-badge-success' : 'log-badge-fail']">
            {{ log.status === 'success' ? '成功' : '失败' }}
          </span>
          <span class="log-time">{{ formatTime(log.created_at) }}</span>
        </div>
      </div>
      <div v-else class="empty-state">暂无运行日志</div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { getDashboard, getOrders, getPlans, getDashboardCharts } from '@/utils/api'
import { showToast } from '@/utils'
import { Line as LineChart, Doughnut as DoughnutChart, Bar as BarChart } from 'vue-chartjs'
import '@/utils/chart' // 按需注册 Chart.js
import { usePlatformStore } from '@/stores/platform'

const platformStore = usePlatformStore()
const dashboardData = ref({})
const recentOrders = ref([])
const plans = ref([])
const chartsData = ref(null)
const chartsLoaded = ref(false)
const planNameMap = {}

const lineChartData = computed(() => {
  if (!chartsData.value) return { labels: [], datasets: [] }
  return {
    labels: chartsData.value.revenue_trend.map(d => d.date),
    datasets: [{
      label: '收入 (¥)',
      data: chartsData.value.revenue_trend.map(d => d.amount),
      borderColor: '#0EA5E9',
      backgroundColor: 'rgba(14,165,233,0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6,
    }]
  }
})

const lineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
    x: { grid: { display: false } }
  }
}

const doughnutChartData = computed(() => {
  if (!chartsData.value) return { labels: [], datasets: [] }
  const colors = ['#0EA5E9', '#FF9900', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4']
  return {
    labels: chartsData.value.plan_distribution.map(d => d.name),
    datasets: [{
      data: chartsData.value.plan_distribution.map(d => d.count),
      backgroundColor: colors.slice(0, chartsData.value.plan_distribution.length),
      borderWidth: 0,
    }]
  }
})

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } } }
}

const barChartData = computed(() => {
  if (!chartsData.value) return { labels: [], datasets: [] }
  return {
    labels: chartsData.value.tool_success_rate.map(d => d.name),
    datasets: [{
      label: '成功率 (%)',
      data: chartsData.value.tool_success_rate.map(d => d.rate),
      backgroundColor: chartsData.value.tool_success_rate.map(d =>
        d.rate >= 95 ? 'rgba(16,185,129,0.7)' : d.rate >= 80 ? 'rgba(245,158,11,0.7)' : 'rgba(239,68,68,0.7)'
      ),
      borderRadius: 6,
    }]
  }
})

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.05)' } },
    x: { grid: { display: false } }
  }
}

function getPlanName(planId) { return planNameMap[planId] || '未知套餐' }
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
    const [dashRes, ordersRes, plansRes, chartsRes] = await Promise.all([
      getDashboard({ platform_key: platformKey }), 
      getOrders(), 
      getPlans(), 
      getDashboardCharts({ platform_key: platformKey })
    ])
    dashboardData.value = dashRes
    recentOrders.value = ordersRes.slice(0, 5)
    plans.value = plansRes
    chartsData.value = chartsRes
    plansRes.forEach(p => { planNameMap[p.id] = p.name })
    chartsLoaded.value = true
  } catch (err) {
    showToast('数据加载失败，请检查后端服务', 'error')
  }
}

watch(() => platformStore.adminPlatform, () => { loadData() })

onMounted(loadData)
</script>

<style scoped>
.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: var(--studio-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  transition: box-shadow var(--transition);
}
.stat-card:hover { box-shadow: var(--studio-shadow-hover); }
.stat-icon {
  width: 48px; height: 48px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.stat-icon svg { width: 24px; height: 24px; }
.stat-content { flex: 1; }
.stat-label { font-size: 0.8rem; color: var(--studio-text-muted); font-weight: 500; }
.stat-value { font-size: 1.75rem; font-weight: 700; line-height: 1.2; }
.stat-sub { font-size: 0.75rem; color: var(--studio-text-muted); margin-top: 0.25rem; }
.charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
.chart-card {
  background: var(--studio-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  padding: 1.25rem;
  box-shadow: var(--studio-shadow);
}
.chart-header h3 { font-size: 1rem; font-weight: 600; color: var(--studio-text-main); margin-bottom: 1rem; }
.chart-container { position: relative; height: 250px; }
.chart-loading { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--studio-text-muted); }

.table-card {
  background: var(--studio-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  box-shadow: var(--studio-shadow);
}
.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.table-header h3 { font-size: 1rem; font-weight: 600; color: var(--studio-text-main); }
.view-all-link { font-size: 0.85rem; color: var(--studio-accent); text-decoration: none; font-weight: 600; }
.view-all-link:hover { color: var(--studio-accent-hover); }

:deep(.studio-table) {
  --el-table-border-color: #E2E8F0;
  --el-table-header-bg-color: #F8FAFC;
  --el-table-row-hover-bg-color: #F1F5F9;
  border-radius: 10px;
  overflow: hidden;
}

.log-list { display: flex; flex-direction: column; gap: 0.5rem; }
.log-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; background: var(--studio-bg); border-radius: 8px; font-size: 0.85rem; }
.log-tool { font-weight: 600; color: var(--studio-text-main); min-width: 120px; }
.log-module { color: var(--studio-text-muted); }
.log-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
.log-badge-success { background: rgba(16,185,129,0.1); color: #10B981; }
.log-badge-fail { background: rgba(239,68,68,0.1); color: #EF4444; }
.log-time { margin-left: auto; color: var(--studio-text-muted); font-size: 0.8rem; }
.empty-row { text-align: center; color: var(--studio-text-muted); padding: 1rem; }
.empty-state { padding: 2rem; text-align: center; color: var(--studio-text-muted); }
@media (max-width: 768px) { .charts-grid { grid-template-columns: 1fr; } }
</style>
