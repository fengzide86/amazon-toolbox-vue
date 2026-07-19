<template>
  <div class="records-page">
    <header><div><span>BUSINESS RECORDS</span><h1>批量流程记录</h1><p>模拟批次与真实批次完全分开，不保存客户原始数据。</p></div><button @click="load"><RefreshCw :size="15" />刷新</button></header>
    <div class="record-tabs" role="tablist" aria-label="批次记录类型">
      <button type="button" role="tab" :aria-selected="activeTab === 'demo'" :class="{ active: activeTab === 'demo' }" @click="activeTab='demo'">演示记录</button>
      <button type="button" role="tab" :aria-selected="activeTab === 'live'" :class="{ active: activeTab === 'live' }" @click="activeTab='live'">真实批次</button>
    </div>
    <p v-if="activeTab === 'demo'" class="demo-note">模拟结果仅用于展示批量流程，不代表真实账号处理成功。</p>
    <AsyncStateNotice v-if="loadState === 'stale'" :state="loadState" :message="loadError" @retry="load" />
    <section class="records-surface">
      <div v-if="loadState === 'loading'" class="empty"><RefreshCw :size="24" class="spin"/><strong>正在加载记录</strong></div>
      <div v-else-if="loadState === 'error'" class="empty error-state" role="alert"><CircleAlert :size="24"/><strong>记录暂时无法加载</strong><p>{{ loadError }}</p><button type="button" @click="load">重新加载</button></div>
      <div v-else-if="rows.length" class="records-list">
        <article v-for="batch in rows" :key="batch.id">
          <div class="tool"><strong>{{ batch.toolName }}</strong><span>{{ formatDate(batch.startedAt) }}</span></div>
          <div><small>{{ activeTab === 'demo' ? '演示项' : '账号数' }}</small><strong>{{ batch.total }}</strong></div>
          <div><small>{{ activeTab === 'demo' ? '已演示' : '已处理' }}</small><strong>{{ batch.processed }}</strong></div>
          <div><small>{{ activeTab === 'demo' ? '演示异常' : '需要操作' }}</small><strong>{{ batch.attention }}</strong></div>
          <span :class="['status', `is-${batch.status}`]">{{ statusText(batch.status) }}</span>
        </article>
      </div>
      <div v-else class="empty">
        <span><Archive :size="24" /></span>
        <strong>{{ activeTab === 'demo' ? '还没有批量演示记录' : '真实批量工具尚未接入' }}</strong>
        <p>{{ activeTab === 'demo' ? '完成第一个模拟批次后，演示结果会显示在这里。' : '当前没有真实批次记录。' }}</p>
        <router-link v-if="activeTab === 'demo'" to="/business/workspace">开始批量演示</router-link>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Archive, CircleAlert, RefreshCw } from '@lucide/vue'
import { useBusinessDemoWorkspaceStore } from '@/stores/businessDemoWorkspace'
import AsyncStateNotice from '@/components/AsyncStateNotice.vue'
import { failedDataState, settledDataState, type AsyncDataState } from '@/features/async/state'
const store = useBusinessDemoWorkspaceStore()
type RecordTab = 'demo' | 'live'
interface BatchRow { id: string | number; toolName: string; startedAt?: string | null; total: number; processed: number; attention: number; status: string }
const activeTab = ref<RecordTab>('demo')
const loadError = ref('')
const loadState = ref<AsyncDataState>('loading')
const rows = computed<BatchRow[]>(() => activeTab.value === 'demo'
  ? store.demoHistory.map(batch => ({ id: batch.id, toolName: batch.tool_name_snapshot, startedAt: batch.started_at || batch.created_at, total: batch.row_count, processed: batch.played_count + batch.skipped_count, attention: batch.error_count, status: batch.status }))
  : store.history.map(batch => ({ id: batch.id, toolName: batch.tool_name, startedAt: batch.started_at, total: batch.total_count, processed: batch.completed_count + batch.failed_count, attention: batch.waiting_count, status: batch.status })))
const load = async () => {
  loadState.value = rows.value.length ? 'data' : 'loading'
  loadError.value = ''
  try {
    if (activeTab.value === 'demo') await store.loadDemoHistory()
    else await store.loadHistory()
    loadState.value = settledDataState(rows.value.length)
  } catch (error) {
    loadError.value = error instanceof Error && error.message ? error.message : '请检查网络连接后重试。'
    loadState.value = failedDataState(rows.value.length > 0)
  }
}
onMounted(load)
watch(activeTab, load)
const formatDate = (value: string | null | undefined): string => value ? new Date(value).toLocaleString('zh-CN') : '-'
const statusLabels: Record<string, string> = {
  created: '待演示', running: '进行中', completed: '演示完成', cancelled: '已退出', error: '演示异常', interrupted: '已中断',
}
const statusText = (value: string): string => activeTab.value === 'live' && value === 'completed' ? '已完成' : statusLabels[value] || value
</script>
<style scoped>
.records-page{display:grid;gap:20px}.records-page>header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.records-page header span{font-size:var(--type-micro);font-weight:800;letter-spacing:.12em;color:var(--color-primary)}h1{margin:7px 0 0;font-size:var(--type-page);letter-spacing:-.04em;color:var(--color-text)}p{margin:8px 0 0;color:var(--color-text-secondary);font-size:var(--type-control);line-height:1.6}button{height:40px;display:flex;align-items:center;gap:7px;padding:0 14px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);color:var(--color-text-secondary);font-size:var(--type-control);cursor:pointer}.records-surface{border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface);overflow:hidden}.records-list article{min-height:74px;display:grid;grid-template-columns:minmax(180px,1fr) repeat(3,100px) 90px;align-items:center;gap:14px;padding:0 20px;border-bottom:1px solid var(--color-border)}.records-list article:last-child{border:0}.tool{display:grid;gap:4px}.tool strong{font-size:var(--type-control);color:var(--color-text)}.tool span,small{font-size:var(--type-meta);color:var(--color-text-tertiary)}article>div:not(.tool){display:grid;gap:4px}article>div:not(.tool)>strong{font-variant-numeric:tabular-nums;color:var(--color-text)}.status{justify-self:end;padding:5px 9px;border-radius:99px;font-size:var(--type-micro);font-weight:700;color:var(--color-text-secondary);background:var(--color-surface-soft)}.status.is-running{color:var(--color-primary);background:var(--color-primary-soft)}.status.is-completed{color:var(--color-success);background:#eaf8f2}.empty{min-height:330px;display:grid;place-content:center;justify-items:center;gap:9px;padding:42px;text-align:center}.empty>span{width:50px;height:50px;display:grid;place-items:center;border-radius:16px;color:var(--color-primary);background:var(--color-primary-soft)}.empty strong{color:var(--color-text);font-size:var(--type-card)}.empty p{max-width:430px;margin:0;color:var(--color-text-secondary)}.empty a{margin-top:8px;color:var(--color-primary);font-size:var(--type-control);font-weight:700;text-decoration:none}@media(max-width:760px){.records-page>header{display:grid}.records-page>header button{width:max-content}.records-list article{grid-template-columns:1fr auto}.records-list article>div:not(.tool){display:none}.empty{padding:30px 18px}}
.record-tabs{display:flex;gap:6px;width:max-content;padding:4px;border:1px solid var(--color-border);border-radius:11px;background:var(--color-surface-soft)}
.record-tabs button{height:34px;border:0;background:transparent}.record-tabs button.active{color:var(--color-primary);background:var(--color-surface);box-shadow:var(--shadow-low)}
.demo-note{margin:-10px 0 0;padding:9px 11px;border-radius:8px;color:var(--color-primary);background:var(--color-primary-soft);font-size:var(--type-meta)}
.status.is-error{color:var(--color-danger);background:var(--color-danger-soft)}.error-state>svg{color:var(--color-danger)}
.spin{animation:records-spin .8s linear infinite}@keyframes records-spin{to{transform:rotate(360deg)}}
</style>
