<template>
  <div>
    <!-- 续费提醒 -->
    <div v-if="renewalReminder.show" :class="['renewal-reminder', renewalReminder.type]">
      <div class="reminder-content">
        <Clock :size="18" />
        <div class="reminder-text">
          <strong>{{ renewalReminder.title }}</strong>
          <span>{{ renewalReminder.message }}</span>
        </div>
      </div>
      <button class="reminder-close" @click="renewalReminder.show = false">
        <X :size="18" />
      </button>
    </div>

    <h2 class="page-title">欢迎回来！</h2>

    <!-- Bento Grid 布局 -->
    <section class="bento-grid">
      <!-- 授权状态 - 大卡片 -->
      <article class="bento-card bento-card-large status-card">
        <div class="card-header-row">
          <div class="card-icon" style="background: linear-gradient(135deg, #10B981, #34D399);">
            <ShieldCheck :size="18" />
          </div>
          <span class="status-badge-active">已激活</span>
        </div>
        <div class="card-body">
          <div class="card-label">授权状态</div>
          <div class="card-value countdown-value">{{ countdownText }}</div>
          <div class="card-sub">套餐：{{ planName }} · 有效期至 {{ expiryDate }}</div>
        </div>
      </article>

      <!-- 已使用工具 -->
      <article class="bento-card">
          <div class="card-icon" style="background: linear-gradient(135deg, var(--studio-accent), var(--studio-accent-light));">
            <Zap :size="18" />
          </div>
          <div class="card-body">
            <div class="card-label">已使用工具</div>
            <div class="card-value" style="color: var(--studio-accent);">{{ toolCount }}</div>
          <div class="card-sub">今日 {{ todayRuns }} 次</div>
        </div>
      </article>

      <!-- 成功率 -->
      <article class="bento-card">
          <div class="card-icon" style="background: linear-gradient(135deg, var(--studio-info), #22D3EE);">
            <BarChart3 :size="18" />
          </div>
          <div class="card-body">
            <div class="card-label">成功率</div>
            <div class="card-value" style="color: var(--studio-info);">{{ successRate }}%</div>
          <div class="card-sub">成功 {{ successCount }} 次</div>
        </div>
      </article>

      <!-- 工具使用趋势 - 宽卡片 -->
      <article class="bento-card bento-card-wide chart-card">
        <div class="chart-header">
          <h3>工具使用记录（近7天）</h3>
          <span class="period">本周</span>
        </div>
        <div class="chart-container">
          <BarChart v-if="chartsLoaded" :data="barChartData" :options="barChartOptions" />
          <div v-else class="chart-loading">加载中...</div>
        </div>
      </article>

      <!-- 工具成功率分布 -->
      <article class="bento-card chart-card">
        <div class="chart-header">
          <h3>工具分布</h3>
          <span class="period">近30天</span>
        </div>
        <div class="chart-container chart-container-sm">
          <DoughnutChart v-if="chartsLoaded" :data="doughnutChartData" :options="doughnutChartOptions" />
          <div v-else class="chart-loading">加载中...</div>
        </div>
      </article>
    </section>

    <section class="table-section">
      <div class="table-header">
        <h3>最近工具运行记录</h3>
        <router-link to="/user/logs" class="view-all-link">查看全部 →</router-link>
      </div>
      <el-table :data="recentLogs" size="small" class="studio-table" style="width: 100%">
        <el-table-column prop="tool_name" label="工具名称" min-width="140">
          <template #default="{ row }">
            {{ row.tool_name || '未知工具' }}
          </template>
        </el-table-column>
        <el-table-column label="运行时间" width="140">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ row.status === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="详情" min-width="160">
          <template #default="{ row }">
            {{ row.detail || '-' }}
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-row">暂无运行记录</div>
        </template>
      </el-table>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getLogs } from '@/utils/api'
import { showToast } from '@/utils'
import { Bar as BarChart, Doughnut as DoughnutChart } from 'vue-chartjs'
import { Clock, X, ShieldCheck, Zap, BarChart3 } from '@lucide/vue'
import '@/utils/chart' // 按需注册 Chart.js

const countdownText = ref('计算中...')
const expiryDate = ref('-')
const planName = ref('未知')
let countdownTimer = null

// 续费提醒
const renewalReminder = ref({
  show: false,
  type: 'warning', // warning, error, info
  title: '',
  message: ''
})
const toolCount = ref(0)
const todayRuns = ref(0)
const successCount = ref(0)
const successRate = ref(0)
const recentLogs = ref([])
const chartsLoaded = ref(false)

const weekDays = ref([])
const maxCount = ref(1)
const toolStats = ref([])

const barChartData = computed(() => ({
  labels: weekDays.value.map(d => d.name),
  datasets: [{
    label: '使用次数',
    data: weekDays.value.map(d => d.count),
    backgroundColor: 'rgba(14,165,233,0.7)',
    borderRadius: 6,
  }]
}))

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      titleFont: { size: 11, weight: '600' },
      bodyFont: { size: 11 },
      padding: 8,
      cornerRadius: 6,
      displayColors: false
    }
  },
  scales: {
    y: { beginAtZero: true, grace: '10%', grid: { color: 'rgba(0,0,0,0.05)' } },
    x: { grid: { display: false } }
  }
}

const doughnutChartData = computed(() => {
  const colors = ['#10B981', '#FF9900', '#EF4444', '#0EA5E9', '#06B6D4', '#8B5CF6']
  return {
    labels: toolStats.value.map(t => t.name),
    datasets: [{
      data: toolStats.value.map(t => t.count),
      backgroundColor: colors.slice(0, toolStats.value.length),
      borderWidth: 0,
    }]
  }
})

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 11 } } },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      titleFont: { size: 11, weight: '600' },
      bodyFont: { size: 11 },
      padding: 8,
      cornerRadius: 6,
      displayColors: false
    }
  }
}

function formatTime(timeStr) {
  if (!timeStr) return '-'
  const d = new Date(timeStr)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function calculateStats(logs) {
  toolCount.value = logs.length
  successCount.value = logs.filter(l => l.status === 'success').length
  successRate.value = logs.length ? Math.round(successCount.value / logs.length * 100) : 0

  const today = new Date().toDateString()
  todayRuns.value = logs.filter(l => new Date(l.created_at).toDateString() === today).length

  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dayMap = {}
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toDateString()
    dayMap[key] = { name: days[d.getDay()], count: 0 }
  }
  logs.forEach(l => {
    const key = new Date(l.created_at).toDateString()
    if (dayMap[key]) dayMap[key].count++
  })
  weekDays.value = Object.values(dayMap)
  maxCount.value = Math.max(...weekDays.value.map(d => d.count), 1)

  const toolMap = {}
  logs.forEach(l => {
    const name = l.tool_name || '未知'
    if (!toolMap[name]) toolMap[name] = { name, total: 0, success: 0 }
    toolMap[name].total++
    if (l.status === 'success') toolMap[name].success++
  })
  toolStats.value = Object.values(toolMap)
    .map(t => ({ name: t.name, count: t.total, rate: Math.round(t.success / t.total * 100) }))
    .slice(0, 4)
}

// 检查续费提醒
function checkRenewalReminder(expiresAt) {
  if (!expiresAt) return
  
  const expireDate = new Date(expiresAt)
  const now = new Date()
  const daysLeft = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24))
  
  // 已过期
  if (daysLeft <= 0) {
    renewalReminder.value = {
      show: true,
      type: 'error',
      title: '授权已到期',
      message: '您的授权已过期，请续费后继续使用。'
    }
    return
  }
  
  // 即将到期（7天内）
  if (daysLeft <= 7) {
    renewalReminder.value = {
      show: true,
      type: 'warning',
      title: `授权将在 ${daysLeft} 天后到期`,
      message: '请及时续费以避免服务中断。'
    }
  }
}

async function loadData() {
  try {
    let userInfo = {}
    try {
      userInfo = JSON.parse(localStorage.getItem('toolbox_user') || '{}')
    } catch (parseErr) {
      console.warn('Failed to parse toolbox_user:', parseErr)
    }
    if (userInfo.plan_name) planName.value = userInfo.plan_name
    if (userInfo.expires_at) {
      expiryDate.value = new Date(userInfo.expires_at).toLocaleDateString('zh-CN')
      
      // 检查续费提醒
      checkRenewalReminder(userInfo.expires_at)
      
      const target = new Date(userInfo.expires_at).getTime()
      function updateCountdown() {
        const now = Date.now()
        const distance = target - now
        if (distance <= 0) {
          countdownText.value = '已到期'
          if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
          return
        }
        const days = Math.floor(distance / (1000 * 60 * 60 * 24))
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const mins = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))
        countdownText.value = `${days}天${hours}时${mins}分`
      }
      updateCountdown()
      countdownTimer = setInterval(updateCountdown, 60 * 1000)
    }
    const userId = userInfo.user_id || userInfo.id || null
    const logs = await getLogs(userId)
    recentLogs.value = logs.slice(0, 5)
    calculateStats(logs)
    chartsLoaded.value = true
  } catch (err) {
    showToast('数据加载失败', 'error')
  }
}

onMounted(loadData)

onUnmounted(() => {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
})
</script>

<style scoped>
/* 续费提醒 */
.renewal-reminder {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  margin-bottom: 1.5rem;
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.renewal-reminder.warning {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(251, 191, 36, 0.1));
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.renewal-reminder.error {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(248, 113, 113, 0.1));
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.reminder-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.reminder-content svg {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.renewal-reminder.warning .reminder-content svg {
  color: #F59E0B;
}

.renewal-reminder.error .reminder-content svg {
  color: #EF4444;
}

.reminder-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.reminder-text strong {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-primary);
}

.reminder-text span {
  font-size: 0.8rem;
  color: var(--color-muted);
}

.reminder-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--color-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.reminder-close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--color-foreground);
}

/* ===== Bento Grid 布局 ===== */
.page-title {
  font-family: var(--font-heading);
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 1.5rem;
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: auto auto;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.bento-card {
  background: var(--color-background, white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  transition: all var(--transition);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bento-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  border-color: var(--color-accent);
}

/* 大卡片 - 占 2 列 */
.bento-card-large {
  grid-column: span 2;
}

/* 宽卡片 - 占 2 列 */
.bento-card-wide {
  grid-column: span 2;
}

/* 状态卡片特殊样式 */
.status-card {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.03), rgba(52, 211, 153, 0.03));
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-icon svg {
  width: 22px;
  height: 22px;
  color: white;
}

.status-badge-active {
  padding: 0.25rem 0.75rem;
  background: rgba(16, 185, 129, 0.1);
  color: #10B981;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.card-label {
  font-size: 0.8rem;
  color: var(--color-muted);
  font-weight: 500;
}

.card-value {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1.2;
}

.countdown-value {
  font-size: 1.25rem;
}

.card-sub {
  font-size: 0.75rem;
  color: var(--color-muted);
}

/* 图表卡片 */
.chart-card {
  background: var(--color-background, white);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  padding: 1.25rem;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.chart-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-primary);
}

.chart-header .period {
  font-size: 0.8rem;
  color: var(--color-muted);
  padding: 0.25rem 0.6rem;
  background: var(--color-border-light);
  border-radius: var(--radius-sm);
}

.chart-container {
  position: relative;
  height: 200px;
}

.chart-container-sm {
  height: 180px;
}

.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-muted);
}

/* 表格区域 */
.table-section {
  background: var(--studio-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.table-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-primary);
}

.view-all-link {
  font-size: 0.85rem;
  color: var(--studio-accent);
  text-decoration: none;
  font-weight: 600;
}

.view-all-link:hover {
  color: var(--studio-accent-hover);
}

:deep(.studio-table) {
  --el-table-border-color: #E2E8F0;
  --el-table-header-bg-color: #F8FAFC;
  --el-table-row-hover-bg-color: #F1F5F9;
  border-radius: 10px;
  overflow: hidden;
}

/* 表格 */
.badge {
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-success {
  background: rgba(16,185,129,0.1);
  color: #10B981;
}

.badge-error {
  background: rgba(239,68,68,0.1);
  color: #EF4444;
}

.empty-row {
  text-align: center;
  color: var(--color-muted);
  padding: 1rem;
}

/* 响应式 */
@media (max-width: 1024px) {
  .bento-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .bento-card-large,
  .bento-card-wide {
    grid-column: span 2;
  }
}

@media (max-width: 640px) {
  .bento-grid {
    grid-template-columns: 1fr;
  }
  .bento-card-large,
  .bento-card-wide {
    grid-column: span 1;
  }
}
</style>
