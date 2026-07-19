<template>
  <div class="business-overview">
    <header class="page-header">
      <div>
        <span class="eyebrow">PROFESSIONAL OPERATIONS</span>
        <div class="title-line"><h1>专业工作台已就绪</h1><span>内部验证版</span></div>
        <p>{{ hasTools ? '选择演示工具，体验多个虚拟项目按顺序推进的流程。' : '批量演示工具会根据验证场景逐个开放。' }}</p>
      </div>
      <div class="page-actions">
        <router-link class="primary-link" to="/business/workspace"><ArrowRight :size="16" />查看工作台</router-link>
        <router-link class="secondary-link" to="/business/license">查看授权信息</router-link>
      </div>
    </header>
    <section class="attention-card" v-if="waitingCount">
      <div class="attention-icon"><BellRing :size="20" /></div>
      <div><strong>{{ waitingCount }} 个演示项等待确认</strong><p>本地模拟状态已经暂存，其他演示项仍会继续播放。</p></div>
      <router-link to="/business/workspace">去处理</router-link>
    </section>
    <section class="capability-grid">
      <article><FileSpreadsheet :size="20" /><div><span>内置演示样例</span><strong>最多 {{ store.entitlements.max_batch_rows || 50 }} 个演示项</strong></div><small>不读取真实客户资料</small></article>
      <article><PanelsTopLeft :size="20" /><div><span>批量队列演示</span><strong>按顺序播放流程</strong></div><small>所有页面与结果均为模拟</small></article>
      <article><ShieldCheck :size="20" /><div><span>模拟人工提示</span><strong>展示完整交互状态</strong></div><small>不会登录或修改真实平台</small></article>
    </section>
    <section class="surface recent">
      <header><div><span>最近演示批次</span><small>模拟记录不计入真实执行统计</small></div><router-link to="/business/records">全部记录</router-link></header>
      <AsyncStateNotice :state="historyState" :message="store.error || ''" loading-text="正在加载演示记录..." @retry="loadHistory" />
      <div v-if="(historyState === 'data' || historyState === 'stale') && store.demoHistory.length" class="batch-list">
        <article v-for="batch in store.demoHistory.slice(0, 5)" :key="batch.id">
          <div><strong>{{ batch.tool_name_snapshot }}</strong><span>{{ formatDate(batch.started_at || batch.created_at) }}</span></div>
          <span class="batch-count">{{ batch.played_count + batch.skipped_count }}/{{ batch.row_count }} 已演示</span>
          <span :class="['status', `is-${batch.status}`]">{{ batchStatus(batch.status) }}</span>
        </article>
      </div>
      <div v-else-if="historyState === 'empty'" class="empty">
        <span class="empty-icon"><Layers3 :size="24" /></span>
        <strong>还没有批量演示记录</strong>
        <p>完成第一个模拟批次后，演示结果会保存在这里。</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ArrowRight, BellRing, FileSpreadsheet, Layers3, PanelsTopLeft, ShieldCheck } from '@lucide/vue'
import AsyncStateNotice from '@/components/AsyncStateNotice.vue'
import type { AsyncDataState } from '@/features/async/state'
import { useBusinessDemoWorkspaceStore } from '@/stores/businessDemoWorkspace'
const store = useBusinessDemoWorkspaceStore()
const waitingCount = computed(() => store.snapshot.counts?.waiting || 0)
const hasTools = computed(() => store.tools.length > 0)
const historyState = computed<AsyncDataState>(() => {
  if (store.loading) return 'loading'
  if (store.error) return store.demoHistory.length ? 'stale' : 'error'
  return store.demoHistory.length ? 'data' : 'empty'
})
const formatDate = (value: string | null | undefined): string => value
  ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '-'
const statusLabels: Record<string, string> = {
  created: '待演示', running: '演示中', completed: '演示完成', cancelled: '已退出', error: '演示异常', interrupted: '已中断',
}
const batchStatus = (value: string): string => statusLabels[value] || value
const loadHistory = (): void => { void store.loadDemoHistory().catch(() => undefined) }
onMounted(loadHistory)
</script>

<style scoped>
.business-overview{display:grid;gap:20px}.page-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}.eyebrow{display:block;margin-bottom:8px;color:var(--color-primary);font-size:var(--type-micro);font-weight:800;letter-spacing:.12em}.title-line{display:flex;align-items:center;gap:12px}.title-line h1{margin:0;color:var(--color-text);font-size:var(--type-page);letter-spacing:-.04em}.title-line>span{padding:6px 9px;border-radius:8px;color:#765d38;background:#f1e8d9;font-size:var(--type-micro);font-weight:800;white-space:nowrap}.page-header p{margin:9px 0 0;color:var(--color-text-secondary);font-size:var(--type-control);line-height:1.6}.page-actions{display:flex;align-items:center;gap:9px}.primary-link,.secondary-link{height:42px;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 17px;border-radius:11px;text-decoration:none;font-size:var(--type-control);font-weight:700}.primary-link{color:#fff;background:var(--color-primary);box-shadow:0 8px 20px rgba(45,95,202,.18)}.secondary-link{border:1px solid var(--color-border);color:var(--color-text);background:var(--color-surface)}
.attention-card{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;padding:18px;border:1px solid rgba(183,121,31,.25);border-radius:15px;background:#fffaf0}.attention-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;color:var(--color-warning);background:#fff0d2}.attention-card strong{color:var(--color-text)}.attention-card p{margin:4px 0 0;color:var(--color-text-secondary);font-size:var(--type-meta)}.attention-card a{color:var(--color-warning);font-weight:700;text-decoration:none}
.capability-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.capability-grid article{min-height:142px;padding:19px;display:grid;grid-template-columns:auto 1fr;align-content:space-between;gap:13px;border:1px solid var(--color-border);border-radius:15px;background:var(--color-surface);box-shadow:var(--shadow-low)}.capability-grid svg{color:var(--color-primary)}.capability-grid div{display:grid;gap:5px}.capability-grid span,.capability-grid small{color:var(--color-text-tertiary);font-size:var(--type-meta)}.capability-grid strong{color:var(--color-text);font-size:15px}.capability-grid small{grid-column:1/-1;align-self:end}
.surface{border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface);box-shadow:var(--shadow-low)}.recent>header{min-height:68px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid var(--color-border)}.recent header div{display:grid;gap:3px}.recent header span{font-size:var(--type-card);font-weight:700;color:var(--color-text)}.recent header small{font-size:var(--type-meta);color:var(--color-text-tertiary)}.recent header a{font-size:var(--type-meta);color:var(--color-primary);text-decoration:none}.batch-list article{min-height:64px;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:18px;padding:0 20px;border-bottom:1px solid var(--color-border)}.batch-list article:last-child{border:0}.batch-list div{display:grid;gap:3px}.batch-list strong{font-size:var(--type-control);color:var(--color-text)}.batch-list div span,.batch-count{font-size:var(--type-meta);color:var(--color-text-tertiary)}.status{padding:5px 9px;border-radius:99px;font-size:var(--type-micro);font-weight:700;background:var(--color-surface-soft);color:var(--color-text-secondary)}.status.is-running{color:var(--color-primary);background:var(--color-primary-soft)}.status.is-completed{color:var(--color-success);background:#eaf8f2}.empty{min-height:190px;display:grid;place-content:center;justify-items:center;gap:8px;padding:34px 20px;text-align:center}.empty-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:15px;color:var(--color-primary);background:var(--color-primary-soft)}.empty strong{color:var(--color-text);font-size:var(--type-card)}.empty p{margin:0;color:var(--color-text-secondary);font-size:var(--type-control)}
@media(max-width:760px){.page-header{display:grid}.page-actions{display:grid;grid-template-columns:1fr 1fr}.capability-grid{grid-template-columns:1fr}.batch-list article{grid-template-columns:1fr auto}.batch-count{display:none}.title-line{align-items:flex-start;flex-direction:column}}
</style>
