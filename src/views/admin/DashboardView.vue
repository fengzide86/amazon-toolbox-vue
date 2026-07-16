<template>
  <div class="action-center">
    <header class="page-heading">
      <div><span>OPERATIONS</span><h2>行动中心</h2><p>先处理会影响客户使用的事项，再查看日常经营数据。</p></div>
      <button class="refresh-button" :disabled="loading" @click="loadData"><RefreshCw :size="15" :class="{ spin: loading }" />刷新</button>
    </header>

    <section class="summary-grid" aria-label="待处理事项摘要">
      <button v-for="card in summaryCards" :key="card.key" :class="['summary-card', `tone-${card.tone}`]" @click="scrollToSection(card.key)">
        <span class="summary-icon"><component :is="card.icon" :size="20" /></span>
        <span><small>{{ card.label }}</small><strong>{{ card.value }}</strong><em>{{ card.hint }}</em></span>
        <ChevronRight :size="17" />
      </button>
    </section>

    <section class="priority-grid">
      <article id="waiting_interventions" class="action-panel primary-panel">
        <header><div><span>优先处理</span><h3>需要人工介入的执行</h3></div><span class="count-badge warning">{{ data.waiting_interventions?.length || 0 }}</span></header>
        <div v-if="data.waiting_interventions?.length" class="action-list">
          <button v-for="item in data.waiting_interventions" :key="`${item.batch_id}-${item.account_label_masked}`" @click="openBatch(item.batch_id)">
            <span class="row-icon warning"><UserRoundCheck :size="17" /></span>
            <span class="row-copy"><strong>{{ item.tool_name }}</strong><small>{{ item.account_label_masked }} · {{ interventionText(item.intervention_type) }}</small></span>
            <span class="row-time">{{ formatRelative(item.updated_at) }}</span><ChevronRight :size="15" />
          </button>
        </div>
        <EmptyState v-else :icon="CheckCircle2" title="暂时没有需要介入的执行" description="客户端遇到登录或验证时，会出现在这里。" />
      </article>

      <article id="stale_batches" class="action-panel">
        <header><div><span>运行关注</span><h3>连接异常候选</h3></div><span class="count-badge">{{ data.stale_batches?.length || 0 }}</span></header>
        <div v-if="data.stale_batches?.length" class="action-list compact">
          <button v-for="item in data.stale_batches" :key="item.batch_id" @click="openBatch(item.batch_id)">
            <span class="row-icon danger"><WifiOff :size="16" /></span>
            <span class="row-copy"><strong>{{ item.tool_name }}</strong><small>超过 90 秒未收到本地状态</small></span>
            <span class="row-time">{{ formatRelative(item.last_heartbeat_at) }}</span><ChevronRight :size="15" />
          </button>
        </div>
        <EmptyState v-else :icon="CheckCircle2" title="批次连接正常" description="当前没有超时未同步的运行批次。" />
      </article>
    </section>

    <section class="operations-grid">
      <article id="expiring_authorizations" class="action-panel">
        <header><div><span>7 天内</span><h3>即将到期授权</h3></div><router-link to="/admin/authcodes">全部授权</router-link></header>
        <div v-if="data.expiring_authorizations?.length" class="simple-list">
          <div v-for="item in data.expiring_authorizations.slice(0, 6)" :key="item.id"><span><KeyRound :size="15" />{{ item.code_masked }}</span><strong>{{ formatDate(item.expires_at) }}</strong></div>
        </div>
        <EmptyState v-else :icon="CheckCircle2" title="近期没有授权到期" description="未来 7 天无需续期跟进。" />
      </article>

      <article id="device_anomalies" class="action-panel">
        <header><div><span>授权边界</span><h3>设备与席位异常</h3></div><router-link to="/admin/authcodes">去处理</router-link></header>
        <div v-if="data.device_anomalies?.length" class="simple-list">
          <div v-for="item in data.device_anomalies.slice(0, 6)" :key="item.auth_code_id"><span><MonitorSmartphone :size="15" />{{ item.code_masked }}</span><strong>{{ item.device_used }}/{{ item.device_limit }} 设备 · {{ item.seat_used }}/{{ item.seat_limit }} 席位</strong></div>
        </div>
        <EmptyState v-else :icon="CheckCircle2" title="授权使用正常" description="没有超出设备或席位上限的授权。" />
      </article>

      <article id="pending_tickets" class="action-panel">
        <header><div><span>客户支持</span><h3>待处理工单</h3></div><router-link to="/admin/feedback">全部工单</router-link></header>
        <div v-if="data.pending_tickets?.length" class="simple-list">
          <div v-for="item in data.pending_tickets.slice(0, 6)" :key="item.id"><span><MessageSquareText :size="15" />{{ item.title }}</span><strong>{{ priorityText(item.priority) }} · {{ formatRelative(item.created_at) }}</strong></div>
        </div>
        <EmptyState v-else :icon="CheckCircle2" title="工单已经处理完" description="当前没有等待回复的客户问题。" />
      </article>
    </section>

    <el-drawer v-model="batchDrawerVisible" size="min(560px, 94vw)" title="批次详情" class="batch-detail-drawer">
      <div v-if="batchLoading" class="drawer-loading"><LoaderCircle :size="22" class="spin" />正在读取脱敏状态</div>
      <div v-else-if="batchDetail" class="batch-detail">
        <div class="detail-hero"><span>业务工具</span><strong>{{ batchDetail.tool_name }}</strong><small>{{ batchDetail.total_count }} 个账号 · {{ batchStatusText(batchDetail.status) }}</small></div>
        <div class="privacy-note"><ShieldCheck :size="16" />这里只展示脱敏标签和执行状态，不保存客户文件、密码或页面内容。</div>
        <div class="batch-items">
          <div v-for="(item,index) in batchDetail.items" :key="`${item.account_label_masked}-${index}`">
            <span :class="['item-state', `is-${item.status}`]"></span>
            <span><strong>{{ item.account_label_masked }}</strong><small>{{ item.customer_message || batchStatusText(item.status) }}</small></span>
            <em>{{ interventionText(item.intervention_type) }}</em>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { CheckCircle2, ChevronRight, KeyRound, LoaderCircle, MessageSquareText, MonitorSmartphone, RefreshCw, ShieldAlert, ShieldCheck, TicketCheck, TimerReset, UserRoundCheck, WifiOff } from '@lucide/vue'
import EmptyState from '@/components/EmptyState.vue'
import { getAdminActionCenter, getAdminBusinessBatch } from '@/utils/api'
import { showToast } from '@/utils'

const data = ref({ summary: {} })
const loading = ref(false)
const batchLoading = ref(false)
const batchDrawerVisible = ref(false)
const batchDetail = ref(null)

const summaryCards = computed(() => [
  { key: 'expiring_authorizations', label: '即将到期授权', value: data.value.summary?.expiring_authorizations || 0, hint: '7 天内需要跟进', icon: TimerReset, tone: 'premium' },
  { key: 'device_anomalies', label: '设备与席位异常', value: data.value.summary?.device_anomalies || 0, hint: '检查授权使用边界', icon: ShieldAlert, tone: 'danger' },
  { key: 'pending_tickets', label: '待处理工单', value: data.value.summary?.pending_tickets || 0, hint: '等待运营回复', icon: TicketCheck, tone: 'neutral' },
  { key: 'waiting_interventions', label: '需要人工介入', value: data.value.summary?.waiting_interventions || 0, hint: '客户执行正在等待', icon: UserRoundCheck, tone: 'warning' },
])

async function loadData() {
  loading.value = true
  try { data.value = await getAdminActionCenter() }
  catch { showToast('行动中心加载失败，请稍后重试', 'error') }
  finally { loading.value = false }
}

async function openBatch(batchId) {
  batchDrawerVisible.value = true
  batchLoading.value = true
  batchDetail.value = null
  try { batchDetail.value = await getAdminBusinessBatch(batchId) }
  catch { showToast('批次详情读取失败', 'error') }
  finally { batchLoading.value = false }
}

function scrollToSection(id) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
function formatDate(value) { return value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value)) : '-' }
function formatRelative(value) {
  if (!value) return '-'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`
  return formatDate(value)
}
function interventionText(type) { return ({ login: '需要登录', captcha: '需要验证码', two_factor: '需要二次验证', page_confirmation: '需要页面确认', other: '需要操作' }[type] || '查看状态') }
function priorityText(value) { return ({ high: '高优先级', medium: '普通', low: '低优先级' }[value] || '普通') }
function batchStatusText(status) { return ({ running: '正在处理', completed: '已完成', cancelled: '已结束', interrupted: '连接中断', waiting_user: '需要操作', failed: '未完成', pending: '等待处理' }[status] || status) }
onMounted(loadData)
</script>

<style scoped>
.action-center{display:grid;gap:18px}.page-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.page-heading>div>span{color:var(--color-accent);font-size:var(--type-micro);font-weight:800;letter-spacing:.14em}.page-heading h2{margin:6px 0 0;color:var(--studio-text-main);font-size:var(--font-page-title);letter-spacing:-.035em}.page-heading p{margin:7px 0 0;color:var(--studio-text-muted);font-size:var(--type-meta)}.refresh-button{height:34px;display:flex;align-items:center;gap:7px;padding:0 11px;border:1px solid var(--studio-border);border-radius:9px;color:var(--studio-text-muted);background:var(--studio-surface);cursor:pointer}.summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.summary-card{min-height:116px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:16px;border:1px solid var(--studio-border);border-radius:15px;background:var(--studio-surface);text-align:left;cursor:pointer;box-shadow:var(--studio-shadow);transition:transform var(--motion-fast),border-color var(--motion-fast),box-shadow var(--motion-fast)}.summary-card:hover{transform:translateY(-2px);border-color:var(--color-border-strong);box-shadow:var(--studio-shadow-hover)}.summary-icon{width:39px;height:39px;display:grid;place-items:center;border-radius:11px;color:var(--color-primary);background:var(--color-primary-soft)}.summary-card>span:nth-child(2){display:grid;gap:3px}.summary-card small{color:var(--studio-text-muted);font-size:var(--type-micro)}.summary-card strong{color:var(--studio-text-main);font-size:24px;font-variant-numeric:tabular-nums}.summary-card em{color:var(--studio-text-muted);font-size:var(--type-micro);font-style:normal}.summary-card>svg{color:var(--color-border-strong)}.tone-premium .summary-icon{color:var(--color-premium);background:var(--color-premium-soft)}.tone-warning .summary-icon{color:var(--color-warning);background:var(--color-warning-soft)}.tone-danger .summary-icon{color:var(--color-danger);background:var(--color-danger-soft)}.priority-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.75fr);gap:14px}.operations-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.action-panel{min-width:0;border:1px solid var(--studio-border);border-radius:15px;background:var(--studio-surface);box-shadow:var(--studio-shadow);overflow:hidden}.primary-panel{border-color:rgba(183,121,31,.18)}.action-panel>header{min-height:66px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 17px;border-bottom:1px solid var(--studio-border)}.action-panel header div{display:grid;gap:4px}.action-panel header span{color:var(--studio-text-muted);font-size:var(--type-micro);letter-spacing:.05em}.action-panel h3{margin:0;color:var(--studio-text-main);font-size:13px}.action-panel header a{color:var(--color-primary);font-size:var(--type-micro);text-decoration:none}.count-badge{min-width:26px;height:26px;display:grid;place-items:center;border-radius:8px;color:var(--studio-text-muted);background:var(--studio-bg);font-size:var(--type-meta);font-weight:800}.count-badge.warning{color:var(--color-warning);background:var(--color-warning-soft)}.action-list{padding:7px}.action-list button{width:100%;min-height:56px;display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:9px;padding:7px 9px;border:0;border-radius:10px;background:transparent;text-align:left;cursor:pointer}.action-list button:hover{background:var(--studio-bg)}.row-icon{width:31px;height:31px;display:grid;place-items:center;border-radius:9px}.row-icon.warning{color:var(--color-warning);background:var(--color-warning-soft)}.row-icon.danger{color:var(--color-danger);background:var(--color-danger-soft)}.row-copy{min-width:0;display:grid;gap:3px}.row-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--studio-text-main);font-size:var(--type-meta)}.row-copy small,.row-time{color:var(--studio-text-muted);font-size:var(--type-micro)}.action-list button>svg{color:var(--color-border-strong)}.simple-list{padding:8px 13px}.simple-list>div{min-height:43px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--studio-border)}.simple-list>div:last-child{border:0}.simple-list span{min-width:0;display:flex;align-items:center;gap:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--studio-text-main);font-size:var(--type-micro)}.simple-list span svg{flex:0 0 auto;color:var(--color-primary)}.simple-list strong{flex:0 0 auto;color:var(--studio-text-muted);font-size:var(--type-micro);font-weight:600}.drawer-loading{min-height:260px;display:grid;place-content:center;justify-items:center;gap:10px;color:var(--studio-text-muted);font-size:var(--type-meta)}.batch-detail{display:grid;gap:16px}.detail-hero{display:grid;gap:5px;padding:17px;border-radius:13px;background:var(--color-primary-soft)}.detail-hero span,.detail-hero small{color:var(--studio-text-muted);font-size:var(--type-micro)}.detail-hero strong{color:var(--studio-text-main);font-size:16px}.privacy-note{display:flex;align-items:flex-start;gap:8px;padding:11px;border-radius:10px;color:var(--color-success);background:var(--color-success-soft);font-size:var(--type-micro);line-height:1.55}.batch-items{display:grid;gap:5px}.batch-items>div{min-height:49px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--studio-border);border-radius:10px}.item-state{width:8px;height:8px;border-radius:50%;background:var(--color-border-strong)}.item-state.is-running{background:var(--color-primary)}.item-state.is-waiting_user{background:var(--color-warning)}.item-state.is-completed{background:var(--color-success)}.item-state.is-failed{background:var(--color-danger)}.batch-items>div>span:nth-child(2){display:grid;gap:3px}.batch-items strong{color:var(--studio-text-main);font-size:var(--type-meta)}.batch-items small,.batch-items em{color:var(--studio-text-muted);font-size:var(--type-micro);font-style:normal}.spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:1100px){.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.operations-grid{grid-template-columns:1fr}.priority-grid{grid-template-columns:1fr}}
@media(max-width:620px){.summary-grid{grid-template-columns:1fr}.page-heading{display:grid}.refresh-button{width:max-content}.row-time{display:none}}
@media(prefers-reduced-motion:reduce){.summary-card{transition:none}.summary-card:hover{transform:none}.spin{animation:none}}

/* Action-center text carries decisions, so it follows the compact-product
   scale instead of the decorative micro scale. */
.refresh-button,
.summary-card,
.action-list button { font-size: var(--type-control); }
.summary-card small,
.summary-card em,
.action-panel header span,
.row-copy small,
.row-time,
.simple-list span,
.simple-list strong,
.detail-hero span,
.detail-hero small,
.privacy-note,
.batch-items small,
.batch-items em { font-size: var(--type-meta); }
.action-panel h3 { font-size: var(--type-card); }
.action-panel header a,
.row-copy strong,
.batch-items strong { font-size: var(--type-control); }
</style>
