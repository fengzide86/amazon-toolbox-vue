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
      <div v-else class="empty">暂无批量执行记录</div>
    </section>
  </div>
</template>
<script setup>
import { onMounted } from 'vue'
import { RefreshCw } from '@lucide/vue'
import { useBusinessWorkspaceStore } from '@/stores/businessWorkspace'
const store=useBusinessWorkspaceStore(); const load=()=>store.loadHistory(); onMounted(load)
const formatDate=v=>v?new Date(v).toLocaleString('zh-CN'):'-'; const statusText=v=>({running:'处理中',completed:'已完成',cancelled:'已结束',interrupted:'已中断'}[v]||v)
</script>
<style scoped>
.records-page{display:grid;gap:20px}.records-page>header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.records-page header span{font-size:var(--type-micro);font-weight:800;letter-spacing:.12em;color:var(--color-primary)}h1{margin:7px 0 0;font-size:28px;letter-spacing:-.04em;color:var(--color-text)}p{margin:8px 0 0;color:var(--color-text-secondary)}button{height:38px;display:flex;align-items:center;gap:7px;padding:0 14px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);color:var(--color-text-secondary);cursor:pointer}.records-surface{border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface);overflow:hidden}.records-list article{min-height:72px;display:grid;grid-template-columns:minmax(180px,1fr) repeat(3,100px) 90px;align-items:center;gap:14px;padding:0 20px;border-bottom:1px solid var(--color-border)}.records-list article:last-child{border:0}.tool{display:grid;gap:4px}.tool strong{font-size:13px;color:var(--color-text)}.tool span,small{font-size:var(--type-micro);color:var(--color-text-tertiary)}article>div:not(.tool){display:grid;gap:4px}article>div:not(.tool)>strong{font-variant-numeric:tabular-nums;color:var(--color-text)}.status{justify-self:end;padding:5px 9px;border-radius:99px;font-size:var(--type-micro);font-weight:700;color:var(--color-text-secondary);background:var(--color-surface-soft)}.status.is-running{color:var(--color-primary);background:var(--color-primary-soft)}.status.is-completed{color:var(--color-success);background:#eaf8f2}.empty{padding:50px;text-align:center;color:var(--color-text-secondary)}@media(max-width:760px){.records-list article{grid-template-columns:1fr auto}.records-list article>div:not(.tool){display:none}}
</style>
