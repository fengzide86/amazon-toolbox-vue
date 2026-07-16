<template>
  <div class="records-page">
    <header class="records-header">
      <div><span class="records-eyebrow">历史记录</span><h2>执行记录</h2><p>查看最近使用过的工具、处理结果和可继续的操作。</p></div>
      <router-link class="support-link" to="/user/ai-chat"><MessageCircle :size="16" />联系客服</router-link>
    </header>

    <section class="records-card">
      <div v-if="loading" class="records-loading"><LoaderCircle :size="22" class="spin" />正在加载…</div>
      <div v-else-if="records.length" class="record-list">
        <article v-for="record in records" :key="record.id" class="record-row">
          <div class="record-icon"><component :is="statusIcon(record.status)" :size="18" /></div>
          <div class="record-main">
            <strong>{{ record.tool_name || '自动化工具' }}</strong>
            <span>{{ formatTime(record.created_at) }}</span>
          </div>
          <span :class="['result-badge', statusClass(record.status)]">{{ statusText(record.status) }}</span>
          <div class="record-actions">
            <button type="button" @click="useAgain(record)">再次使用</button>
            <button v-if="record.status === 'failed'" type="button" class="support" @click="contactSupport(record)">联系客服</button>
          </div>
        </article>
      </div>
      <div v-else class="empty-records">
        <History :size="42" :stroke-width="1.5" />
        <h3>还没有使用记录</h3>
        <router-link to="/user/tools">选择一个工具开始</router-link>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Ban, Check, CircleAlert, History, LoaderCircle, MessageCircle } from '@lucide/vue'
import { getLogs } from '@/utils/api'
import { showToast } from '@/utils'
import { usePlatformStore } from '@/stores/platform'

const router = useRouter()
const platformStore = usePlatformStore()
const records = ref([])
const loading = ref(true)

function formatTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function statusText(status) {
  return { success: '已完成', failed: '未完成', cancelled: '已停止' }[status] || '已结束'
}

function statusClass(status) {
  return { success: 'success', failed: 'failed', cancelled: 'cancelled' }[status] || 'cancelled'
}

function statusIcon(status) {
  return status === 'success' ? Check : status === 'failed' ? CircleAlert : Ban
}

function detailOf(record) {
  try { return JSON.parse(record.detail || '{}') } catch { return {} }
}

function useAgain(record) {
  const detail = detailOf(record)
  router.push({ path: '/user/tools', query: detail.tool_id ? { tool: detail.tool_id } : {} })
}

function contactSupport(record) {
  const detail = detailOf(record)
  localStorage.setItem('toolbox_support_context', JSON.stringify({
    run_id: detail.run_id,
    tool_id: detail.tool_id,
    tool_name: record.tool_name,
    platform_key: detail.platform_key || platformStore.currentPlatform,
    error_code: record.error_code,
  }))
  router.push('/user/ai-chat')
}

async function loadRecords() {
  loading.value = true
  try {
    records.value = await getLogs({ platform_key: platformStore.currentPlatform, limit: 100 })
  } catch (error) {
    showToast('使用记录加载失败', 'error')
  } finally {
    loading.value = false
  }
}

watch(() => platformStore.currentPlatform, loadRecords)
onMounted(loadRecords)
</script>

<style scoped>
.records-page { width: min(1050px, 100%); margin: 0 auto; }
.records-eyebrow { display: block; margin-bottom: 8px; color: var(--color-primary); font-size:var(--type-meta); font-weight: 800; letter-spacing: .12em; }
.records-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
.records-header h2 { margin: 0; color: var(--studio-text-main); font-size: var(--font-page-title); letter-spacing: -.03em; }
.records-header p { margin: 7px 0 0; color: var(--studio-text-muted); font-size: 13px; }
.support-link { min-height: 38px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; border: 1px solid var(--studio-border); border-radius: var(--radius-md); color: var(--studio-text-main); background: var(--color-surface); font-size:var(--type-control); font-weight: 700; text-decoration: none; }
.support-link:hover { color: var(--studio-accent); border-color: var(--studio-accent-light); }
.records-card { overflow: hidden; border: 1px solid var(--studio-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--studio-shadow); }
.record-row { min-height: 76px; display: grid; grid-template-columns: 40px minmax(160px, 1fr) 86px auto; align-items: center; gap: 14px; padding: 13px 18px; border-bottom: 1px solid var(--studio-border); transition: background var(--motion-fast); }
.record-row:hover { background: var(--color-surface-soft); }
.record-row:last-child { border-bottom: 0; }
.record-icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 9px; color: var(--studio-accent); background: var(--studio-accent-bg); }
.record-main strong, .record-main span { display: block; }
.record-main strong { color: var(--studio-text-main); font-size: 13px; }
.record-main span { margin-top: 4px; color: var(--studio-text-muted); font-size:var(--type-meta); }
.result-badge { justify-self: start; padding: 4px 8px; border-radius: 999px; font-size:var(--type-meta); font-weight: 700; }
.result-badge.success { color: var(--color-success); background: var(--color-success-soft); }
.result-badge.failed { color: var(--color-danger); background: var(--color-danger-soft); }
.result-badge.cancelled { color: var(--studio-text-muted); background: var(--studio-bg-hover); }
.record-actions { display: flex; gap: 7px; }
.record-actions button { min-height: 32px; padding: 0 10px; border: 1px solid var(--studio-border); border-radius: 7px; color: var(--studio-text-main); background: white; font-size:var(--type-meta); font-weight: 700; cursor: pointer; }
.record-actions button:hover { border-color: var(--studio-accent-light); color: var(--studio-accent); }
.record-actions .support { color: var(--studio-danger); }
.records-loading, .empty-records { min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--studio-text-muted); }
.records-loading { flex-direction: row; font-size: 13px; }
.empty-records h3 { margin: 0; color: var(--studio-text-main); font-size: 15px; }
.empty-records a { color: var(--studio-accent); font-size:var(--type-control); font-weight: 700; text-decoration: none; }
.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 700px) {
  .record-row { grid-template-columns: 38px 1fr auto; }
  .record-actions { grid-column: 2 / -1; }
  .result-badge { justify-self: end; }
}
</style>
