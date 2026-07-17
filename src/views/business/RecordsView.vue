<template>
  <div class="records-page">
    <header><div><span>BUSINESS RECORDS</span><h1>批量执行记录</h1><p>记录批次结果和需要处理的状态，不保存客户原始数据。</p></div><button @click="load"><RefreshCw :size="15" />刷新</button></header>
    <section class="records-surface">
      <div v-if="store.history.length" class="records-list">
        <article v-for="batch in store.history" :key="batch.id">
          <div class="tool"><strong>{{ batch.tool_name }}</strong><span>{{ formatDate(batch.started_at) }}</span></div>
          <div><small>账号数</small><strong>{{ batch.total_count }}</strong></div>
          <div><small>已处理</small><strong>{{ batch.completed_count + batch.failed_count }}</strong></div>
          <div><small>需要操作</small><strong>{{ batch.waiting_count }}</strong></div>
          <span :class="['status', `is-${batch.status}`]">{{ statusText(batch.status) }}</span>
        </article>
      </div>
      <div v-else class="empty">
        <span><Archive :size="24" /></span>
        <strong>还没有执行记录</strong>
        <p>完成第一个真实批次后，工具、时间和处理结果会显示在这里。</p>
        <router-link to="/business/workspace">查看专业工作台</router-link>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { onMounted } from 'vue'
import { Archive, RefreshCw } from '@lucide/vue'
import { useBusinessWorkspaceStore } from '@/stores/businessWorkspace'
const store = useBusinessWorkspaceStore()
const load = () => store.loadHistory()
onMounted(load)
const formatDate = (value: string | null | undefined): string => value ? new Date(value).toLocaleString('zh-CN') : '-'
const statusLabels: Record<string, string> = {
  running: '处理中', completed: '已完成', cancelled: '已结束', interrupted: '已中断',
}
const statusText = (value: string): string => statusLabels[value] || value
</script>
<style scoped>
.records-page{display:grid;gap:20px}.records-page>header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.records-page header span{font-size:var(--type-micro);font-weight:800;letter-spacing:.12em;color:var(--color-primary)}h1{margin:7px 0 0;font-size:var(--type-page);letter-spacing:-.04em;color:var(--color-text)}p{margin:8px 0 0;color:var(--color-text-secondary);font-size:var(--type-control);line-height:1.6}button{height:40px;display:flex;align-items:center;gap:7px;padding:0 14px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);color:var(--color-text-secondary);font-size:var(--type-control);cursor:pointer}.records-surface{border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface);overflow:hidden}.records-list article{min-height:74px;display:grid;grid-template-columns:minmax(180px,1fr) repeat(3,100px) 90px;align-items:center;gap:14px;padding:0 20px;border-bottom:1px solid var(--color-border)}.records-list article:last-child{border:0}.tool{display:grid;gap:4px}.tool strong{font-size:var(--type-control);color:var(--color-text)}.tool span,small{font-size:var(--type-meta);color:var(--color-text-tertiary)}article>div:not(.tool){display:grid;gap:4px}article>div:not(.tool)>strong{font-variant-numeric:tabular-nums;color:var(--color-text)}.status{justify-self:end;padding:5px 9px;border-radius:99px;font-size:var(--type-micro);font-weight:700;color:var(--color-text-secondary);background:var(--color-surface-soft)}.status.is-running{color:var(--color-primary);background:var(--color-primary-soft)}.status.is-completed{color:var(--color-success);background:#eaf8f2}.empty{min-height:330px;display:grid;place-content:center;justify-items:center;gap:9px;padding:42px;text-align:center}.empty>span{width:50px;height:50px;display:grid;place-items:center;border-radius:16px;color:var(--color-primary);background:var(--color-primary-soft)}.empty strong{color:var(--color-text);font-size:var(--type-card)}.empty p{max-width:430px;margin:0;color:var(--color-text-secondary)}.empty a{margin-top:8px;color:var(--color-primary);font-size:var(--type-control);font-weight:700;text-decoration:none}@media(max-width:760px){.records-page>header{display:grid}.records-page>header button{width:max-content}.records-list article{grid-template-columns:1fr auto}.records-list article>div:not(.tool){display:none}.empty{padding:30px 18px}}
</style>
