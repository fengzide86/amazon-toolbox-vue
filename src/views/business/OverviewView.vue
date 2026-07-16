<template>
  <div class="business-overview">
    <header class="page-header">
      <div><span class="eyebrow">PROFESSIONAL OPERATIONS</span><h1>批量业务工作台</h1><p>一个账号需要操作时，系统会保留现场并继续处理后面的账号。</p></div>
      <router-link class="primary-link" to="/business/workspace"><Plus :size="16" />新建批次</router-link>
    </header>
    <section class="attention-card" v-if="waitingCount">
      <div class="attention-icon"><BellRing :size="20" /></div>
      <div><strong>{{ waitingCount }} 个账号需要你操作</strong><p>浏览器现场已经保留，其他账号仍会继续处理。</p></div>
      <router-link to="/business/workspace">去处理</router-link>
    </section>
    <section class="capability-grid">
      <article><FileSpreadsheet :size="20" /><span>本地批量导入</span><strong>{{ store.entitlements.max_batch_rows || 50 }} 行/批次</strong></article>
      <article><PanelsTopLeft :size="20" /><span>浏览器现场</span><strong>最多 {{ store.entitlements.max_open_sessions || 6 }} 个</strong></article>
      <article><ShieldCheck :size="20" /><span>账号数据</span><strong>只在本机处理</strong></article>
    </section>
    <section class="surface recent">
      <header><div><span>最近批次</span><small>只展示业务状态，不展示内部脚本指标</small></div><router-link to="/business/records">全部记录</router-link></header>
      <div v-if="store.history.length" class="batch-list">
        <article v-for="batch in store.history.slice(0, 5)" :key="batch.id">
          <div><strong>{{ batch.tool_name }}</strong><span>{{ formatDate(batch.started_at) }}</span></div>
          <span class="batch-count">{{ batch.completed_count + batch.failed_count }}/{{ batch.total_count }} 已处理</span>
          <span :class="['status', `is-${batch.status}`]">{{ batchStatus(batch.status) }}</span>
        </article>
      </div>
      <div v-else class="empty">还没有批次记录。选择一个工具并导入客户数据即可开始。</div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { BellRing, FileSpreadsheet, PanelsTopLeft, Plus, ShieldCheck } from '@lucide/vue'
import { useBusinessWorkspaceStore } from '@/stores/businessWorkspace'
const store = useBusinessWorkspaceStore()
const waitingCount = computed(() => store.snapshot.counts?.waiting || 0)
const formatDate = value => value ? new Date(value).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '-'
const batchStatus = value => ({ running:'处理中', completed:'已完成', cancelled:'已结束', interrupted:'已中断' }[value] || value)
onMounted(() => store.loadHistory())
</script>

<style scoped>
.business-overview{display:grid;gap:20px}.page-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}.eyebrow{display:block;margin-bottom:8px;color:var(--color-accent);font-size:var(--type-micro);font-weight:800;letter-spacing:.12em}.page-header h1{margin:0;color:var(--color-text);font-size:30px;letter-spacing:-.04em}.page-header p{margin:8px 0 0;color:var(--color-text-secondary)}.primary-link{height:42px;display:flex;align-items:center;gap:8px;padding:0 18px;border-radius:11px;color:#fff;background:var(--color-primary);text-decoration:none;font-size:13px;font-weight:700;box-shadow:0 8px 20px rgba(45,95,202,.18)}
.attention-card{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;padding:18px;border:1px solid rgba(183,121,31,.25);border-radius:15px;background:#fffaf0}.attention-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;color:var(--color-warning);background:#fff0d2}.attention-card strong{color:var(--color-text)}.attention-card p{margin:4px 0 0;color:var(--color-text-secondary);font-size:var(--type-meta)}.attention-card a{color:var(--color-warning);font-weight:700;text-decoration:none}
.capability-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.capability-grid article{min-height:110px;padding:18px;display:grid;align-content:space-between;border:1px solid var(--color-border);border-radius:15px;background:var(--color-surface);box-shadow:var(--shadow-low)}.capability-grid svg{color:var(--color-primary)}.capability-grid span{color:var(--color-text-tertiary);font-size:var(--type-meta)}.capability-grid strong{color:var(--color-text);font-size:15px}
.surface{border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface);box-shadow:var(--shadow-low)}.recent>header{min-height:65px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid var(--color-border)}.recent header div{display:grid;gap:3px}.recent header span{font-weight:700;color:var(--color-text)}.recent header small{color:var(--color-text-tertiary)}.recent header a{font-size:var(--type-meta);color:var(--color-primary);text-decoration:none}.batch-list article{min-height:60px;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:18px;padding:0 20px;border-bottom:1px solid var(--color-border)}.batch-list article:last-child{border:0}.batch-list div{display:grid;gap:3px}.batch-list strong{font-size:13px;color:var(--color-text)}.batch-list div span,.batch-count{font-size:var(--type-meta);color:var(--color-text-tertiary)}.status{padding:5px 9px;border-radius:99px;font-size:var(--type-micro);font-weight:700;background:var(--color-surface-soft);color:var(--color-text-secondary)}.status.is-running{color:var(--color-primary);background:var(--color-primary-soft)}.status.is-completed{color:var(--color-success);background:#eaf8f2}.empty{padding:42px 20px;text-align:center;color:var(--color-text-secondary);font-size:13px}
@media(max-width:760px){.page-header{display:grid}.primary-link{width:max-content}.capability-grid{grid-template-columns:1fr}.batch-list article{grid-template-columns:1fr auto}.batch-count{display:none}}
</style>
