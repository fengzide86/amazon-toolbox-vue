<template>
  <div class="records-page">
    <PageHeader eyebrow="活动记录" title="工具记录" description="演示记录与真实执行记录完全分开，不会混合统计。">
      <template #actions>
        <router-link class="support-link" to="/user/ai-chat"><MessageCircle :size="16" />联系帮助</router-link>
      </template>
    </PageHeader>

    <div class="record-tabs" role="tablist" aria-label="记录类型">
      <button type="button" role="tab" :aria-selected="activeTab === 'demo'" :class="{ active: activeTab === 'demo' }" @click="activeTab = 'demo'">演示记录</button>
      <button type="button" role="tab" :aria-selected="activeTab === 'live'" :class="{ active: activeTab === 'live' }" @click="activeTab = 'live'">真实执行</button>
    </div>

    <p v-if="activeTab === 'demo'" class="record-disclosure">仅记录模拟流程是否走完，不代表真实平台任务成功。</p>
    <AsyncStateNotice v-if="staleError" state="stale" :message="staleError" @retry="loadRecords" />

    <section class="records-card" :aria-busy="loading">
      <div v-if="loading" class="records-loading"><LoaderCircle :size="22" class="spin" />正在加载…</div>
      <div v-else-if="loadError" class="empty-records error-records" role="alert">
        <CircleAlert :size="42" :stroke-width="1.5" />
        <h3>记录暂时无法加载</h3>
        <p>{{ loadError }}</p>
        <button type="button" @click="loadRecords">重新加载</button>
      </div>
      <div v-else-if="rows.length" class="record-list">
        <article v-for="record in rows" :key="`${record.kind}-${record.id}`" class="record-row">
          <div class="record-icon"><component :is="statusIcon(record.status)" :size="18" /></div>
          <div class="record-main">
            <strong>{{ record.toolName }}</strong>
            <span>{{ formatTime(record.time) }}</span>
          </div>
          <div class="record-badges">
            <span :class="['kind-badge', record.kind]">{{ record.kind === 'demo' ? '模拟' : '真实' }}</span>
            <span :class="['result-badge', statusClass(record.status)]">{{ statusText(record.status, record.kind) }}</span>
          </div>
          <div class="record-actions">
            <button type="button" @click="useAgain(record)">{{ record.kind === 'demo' ? '再次演示' : '再次使用' }}</button>
            <button v-if="record.kind === 'live' && record.status === 'failed'" type="button" class="support" @click="contactSupport(record)">联系帮助</button>
          </div>
        </article>
      </div>
      <div v-else class="empty-records">
        <History :size="42" :stroke-width="1.5" />
        <h3>{{ activeTab === 'demo' ? '还没有演示记录' : '真实工具尚未接入' }}</h3>
        <p v-if="activeTab === 'live'">当前没有真实执行记录。</p>
        <router-link v-else to="/user/tools">选择一个工具开始演示</router-link>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Ban, Check, CircleAlert, History, LoaderCircle, MessageCircle } from '@lucide/vue'
import { getDemoRuns, getExecutions } from '@/utils/api'
import { usePlatformStore } from '@/stores/platform'
import { demoRunListSchema } from '@/features/demo/model'
import { executionRecordListSchema } from '@/features/user/model'
import AsyncStateNotice from '@/components/AsyncStateNotice.vue'
import PageHeader from '@/components/PageHeader.vue'

type RecordKind = 'demo' | 'live'
interface RecordRow {
  id: string | number
  kind: RecordKind
  toolId?: string
  toolName: string
  status: string
  time?: string | null
  errorCode?: string | null
}

const router = useRouter()
const platformStore = usePlatformStore()
const activeTab = ref<RecordKind>('demo')
const demoRows = ref<RecordRow[]>([])
const liveRows = ref<RecordRow[]>([])
const loading = ref(true)
const loadError = ref('')
const staleError = ref('')
const rows = computed(() => activeTab.value === 'demo' ? demoRows.value : liveRows.value)

function formatTime(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function statusText(status: string, kind: RecordKind): string {
  if (kind === 'demo') return ({ created: '待演示', running: '演示中', paused: '已暂停', completed: '演示完成', cancelled: '已退出', error: '演示异常' } as Record<string, string>)[status] || '演示已结束'
  return ({ queued: '等待执行', running: '执行中', verifying: '核验中', succeeded: '真实成功', failed: '执行失败', cancelled: '已取消', interrupted: '已中断', inconclusive: '结果未确认' } as Record<string, string>)[status] || '已结束'
}

function statusClass(status: string): string {
  if (status === 'completed' || status === 'succeeded') return 'success'
  if (status === 'error' || status === 'failed') return 'failed'
  return 'cancelled'
}

function statusIcon(status: string) {
  return status === 'completed' || status === 'succeeded' ? Check : status === 'error' || status === 'failed' ? CircleAlert : Ban
}

function useAgain(record: RecordRow) {
  void router.push({ path: '/user/tools', query: record.toolId ? { tool: record.toolId } : {} })
}

function contactSupport(record: RecordRow) {
  localStorage.setItem('toolbox_support_context', JSON.stringify({
    run_id: record.id,
    tool_id: record.toolId,
    tool_name: record.toolName,
    platform_key: platformStore.currentPlatform,
    error_code: record.errorCode,
  }))
  void router.push('/user/ai-chat')
}

async function loadRecords() {
  const hadData = rows.value.length > 0
  loading.value = !hadData
  loadError.value = ''
  staleError.value = ''
  try {
    if (activeTab.value === 'demo') {
      demoRows.value = demoRunListSchema.parse(await getDemoRuns({ platform_key: platformStore.currentPlatform, page_size: 100 })).map(record => ({
        id: record.id,
        kind: 'demo',
        toolId: String(record.tool_id),
        toolName: record.tool_name_snapshot,
        status: record.status,
        time: record.started_at || record.created_at,
        errorCode: record.error_code,
      }))
    } else {
      liveRows.value = executionRecordListSchema.parse(await getExecutions({ platform_key: platformStore.currentPlatform, limit: 100 })).map(record => ({
        id: record.id,
        kind: 'live',
        toolId: record.tool_id === null || record.tool_id === undefined ? undefined : String(record.tool_id),
        toolName: record.tool_name || '真实执行',
        status: record.status,
        time: record.created_at,
        errorCode: record.error_code,
      }))
    }
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '请检查网络连接后重试。'
    if (hadData) staleError.value = message
    else loadError.value = message
  } finally {
    loading.value = false
  }
}

watch(activeTab, loadRecords)
watch(() => platformStore.currentPlatform, () => {
  demoRows.value = []
  liveRows.value = []
  void loadRecords()
})
onMounted(loadRecords)
</script>

<style scoped>
.records-page { width: min(1050px, 100%); margin: 0 auto; }
.records-eyebrow { display: block; margin-bottom: 8px; color: var(--color-primary); font-size:var(--type-meta); font-weight: 800; letter-spacing: .12em; }
.records-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
.records-header h2 { margin: 0; color: var(--color-text); font-size: var(--type-page); letter-spacing: -.03em; }
.records-header p { margin: 7px 0 0; color: var(--color-text-secondary); font-size: 13px; }
.support-link { min-height: 38px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text); background: var(--color-surface); font-size:var(--type-control); font-weight: 700; text-decoration: none; }
.support-link:hover { color: var(--color-primary); border-color: var(--color-primary-muted); }
.record-tabs { display: flex; gap: 6px; margin-bottom: 10px; padding: 4px; width: max-content; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-surface-soft); }
.record-tabs button { min-height: 34px; padding: 0 13px; border: 0; border-radius: 7px; color: var(--color-text-secondary); background: transparent; font-size: var(--type-control); font-weight: 700; cursor: pointer; }
.record-tabs button.active { color: var(--color-primary); background: var(--color-surface); box-shadow: var(--shadow-low); }
.record-disclosure { margin: 0 0 12px; padding: 9px 11px; border-radius: 8px; color: var(--color-primary); background: var(--color-primary-soft); font-size: var(--type-meta); }
.records-card { overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-low); }
.record-row { min-height: 76px; display: grid; grid-template-columns: 40px minmax(160px, 1fr) 86px auto; align-items: center; gap: 14px; padding: 13px 18px; border-bottom: 1px solid var(--color-border); transition: background var(--motion-fast); }
.record-row:hover { background: var(--color-surface-soft); }
.record-row:last-child { border-bottom: 0; }
.record-icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 9px; color: var(--color-primary); background: var(--color-primary-soft); }
.record-main strong, .record-main span { display: block; }
.record-main strong { color: var(--color-text); font-size: 13px; }
.record-main span { margin-top: 4px; color: var(--color-text-secondary); font-size:var(--type-meta); }
.result-badge { justify-self: start; padding: 4px 8px; border-radius: 999px; font-size:var(--type-meta); font-weight: 700; }
.result-badge.success { color: var(--color-success); background: var(--color-success-soft); }
.result-badge.failed { color: var(--color-danger); background: var(--color-danger-soft); }
.result-badge.cancelled { color: var(--color-text-secondary); background: var(--color-surface-soft); }
.record-badges { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
.kind-badge { padding: 4px 7px; border-radius: 999px; font-size: var(--type-micro); font-weight: 800; }
.kind-badge.demo { color: var(--color-primary); background: var(--color-primary-soft); }
.kind-badge.live { color: var(--color-success); background: var(--color-success-soft); }
.record-actions { display: flex; gap: 7px; }
.record-actions button { min-height: 32px; padding: 0 10px; border: 1px solid var(--color-border); border-radius: 7px; color: var(--color-text); background: white; font-size:var(--type-meta); font-weight: 700; cursor: pointer; }
.record-actions button:hover { border-color: var(--color-primary-muted); color: var(--color-primary); }
.record-actions .support { color: var(--color-danger); }
.records-loading, .empty-records { min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--color-text-secondary); }
.records-loading { flex-direction: row; font-size: 13px; }
.empty-records h3 { margin: 0; color: var(--color-text); font-size: 15px; }
.empty-records a { color: var(--color-primary); font-size:var(--type-control); font-weight: 700; text-decoration: none; }
.empty-records p { margin: 0; font-size: var(--type-control); }
.empty-records button { min-height: 36px; padding: 0 12px; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-primary); background: var(--color-surface); font-weight: 700; cursor: pointer; }
.error-records > svg { color: var(--color-danger); }
.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 700px) {
  .record-row { grid-template-columns: 38px 1fr auto; }
  .record-actions { grid-column: 2 / -1; }
  .result-badge { justify-self: end; }
}
</style>
