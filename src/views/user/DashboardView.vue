<template>
  <div>
    <!-- 续费提醒 -->
    <div v-if="renewalReminder.show" :class="['renewal-reminder', renewalReminder.type]">
      <div class="reminder-content">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div class="reminder-text">
          <strong>{{ renewalReminder.title }}</strong>
          <span>{{ renewalReminder.message }}</span>
        </div>
      </div>
      <button class="reminder-close" @click="renewalReminder.show = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <h2 class="page-title">欢迎回来！</h2>
    <section class="stats-row">
      <article class="stat-card">
        <div class="stat-icon" style="background: rgba(16,185,129,0.1);">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
        </div>
        <div class="stat-content">
          <div class="stat-label">授权状态</div>
          <div class="stat-value" style="color: #10B981;">已激活</div>
          <div class="stat-sub">剩余 {{ countdownText }}</div>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon" style="background: rgba(99,102,241,0.1);">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <div class="stat-content">
          <div class="stat-label">已使用工具</div>
          <div class="stat-value" style="color: #6366F1;">{{ toolCount }}</div>
          <div class="stat-sub">今日 {{ todayRuns }} 次</div>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon" style="background: rgba(6,182,212,0.1);">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
        </div>
        <div class="stat-content">
          <div class="stat-label">运行成功次数</div>
          <div class="stat-value" style="color: #06B6D4;">{{ successCount }}</div>
          <div class="stat-sub">成功率 {{ successRate }}%</div>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon" style="background: rgba(139,92,246,0.1);">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </div>
        <div class="stat-content">
          <div class="stat-label">套餐类型</div>
          <div class="stat-value" style="color: #8B5CF6; font-size: 1.25rem;">{{ planName }}</div>
          <div class="stat-sub">有效期至 {{ expiryDate }}</div>
        </div>
      </article>
    </section>

    <section class="charts-grid">
      <div class="chart-card">
        <div class="chart-header">
          <h3>工具使用记录（近7天）</h3>
          <span class="period">本周</span>
        </div>
        <div class="chart-container">
          <BarChart v-if="chartsLoaded" :data="barChartData" :options="barChartOptions" />
          <div v-else class="chart-loading">加载中...</div>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>工具成功率</h3>
          <span class="period">近30天</span>
        </div>
        <div class="chart-container">
          <DoughnutChart v-if="chartsLoaded" :data="doughnutChartData" :options="doughnutChartOptions" />
          <div v-else class="chart-loading">加载中...</div>
        </div>
      </div>
    </section>

    <section class="table-card">
      <div class="table-header">
        <h3>最近工具运行记录</h3>
        <router-link to="/user/logs">查看全部 →</router-link>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>工具名称</th>
            <th>运行时间</th>
            <th>状态</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in recentLogs" :key="log.id">
            <td>{{ log.tool_name || '未知工具' }}</td>
            <td>{{ formatTime(log.created_at) }}</td>
            <td>
              <span :class="['badge', log.status === 'success' ? 'badge-success' : 'badge-error']">
                {{ log.status === 'success' ? '成功' : '失败' }}
              </span>
            </td>
            <td>{{ log.detail || '-' }}</td>
          </tr>
          <tr v-if="!recentLogs.length">
            <td colspan="4" class="empty-row">暂无运行记录</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getLogs } from '@/utils/api'
import { showToast } from '@/utils'
import { Bar as BarChart, Doughnut as DoughnutChart } from 'vue-chartjs'
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
    backgroundColor: 'rgba(99,102,241,0.7)',
    borderRadius: 6,
  }]
}))

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
    x: { grid: { display: false } }
  }
}

const doughnutChartData = computed(() => {
  const colors = ['#10B981', '#F59E0B', '#EF4444', '#6366F1', '#06B6D4', '#8B5CF6']
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
  plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 11 } } } }
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

.page-title { font-family: var(--font-heading); font-size: 1.875rem; font-weight: 700; color: var(--color-primary); margin-bottom: 1.5rem; }
.stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
.stat-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; background: white; border-radius: 16px; border: 1px solid var(--color-border); transition: box-shadow 0.2s; }
.stat-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.stat-icon svg { width: 24px; height: 24px; }
.stat-content { flex: 1; }
.stat-label { font-size: 0.8rem; color: var(--color-muted); font-weight: 500; }
.stat-value { font-size: 1.75rem; font-weight: 700; line-height: 1.2; }
.stat-sub { font-size: 0.75rem; color: var(--color-muted); margin-top: 0.25rem; }
.charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
.chart-card { background: white; border-radius: 16px; border: 1px solid var(--color-border); padding: 1.25rem; }
.chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.chart-header h3 { font-size: 1rem; font-weight: 600; color: var(--color-primary); }
.chart-header .period { font-size: 0.8rem; color: var(--color-muted); }
.chart-container { position: relative; height: 220px; }
.chart-loading { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted); }
.badge { padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
.badge-success { background: rgba(16,185,129,0.1); color: #10B981; }
.badge-error { background: rgba(239,68,68,0.1); color: #EF4444; }
.empty-row { text-align: center; color: var(--color-muted); padding: 1rem; }
@media (max-width: 768px) { .charts-grid { grid-template-columns: 1fr; } }
</style>