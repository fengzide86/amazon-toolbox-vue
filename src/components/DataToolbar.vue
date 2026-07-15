<template>
  <div class="data-toolbar-v6" role="group" :aria-label="label">
    <div class="data-toolbar-v6__filters"><slot /></div>
    <div v-if="$slots.summary" class="data-toolbar-v6__summary"><slot name="summary" /></div>
    <div v-if="$slots.actions" class="data-toolbar-v6__actions"><slot name="actions" /></div>
  </div>
</template>

<script setup>
defineProps({ label: { type: String, default: '数据筛选与操作' } })
</script>

<style scoped>
.data-toolbar-v6__filters { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.data-toolbar-v6__summary { color: var(--color-text-secondary); font-size: 13px; white-space: nowrap; }
.data-toolbar-v6__actions { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; }
@media (max-width: 760px) {
  .data-toolbar-v6__filters { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .data-toolbar-v6__filters :deep(.el-input),
  .data-toolbar-v6__filters :deep(.el-select) { width: 100% !important; min-width: 0 !important; }
  .data-toolbar-v6__summary { margin-right: auto; }
  .data-toolbar-v6__actions { margin-left: 0; }
}
@media (max-width: 520px) {
  .data-toolbar-v6__filters { grid-template-columns: 1fr; }
  .data-toolbar-v6__summary,
  .data-toolbar-v6__actions { width: 100%; }
  .data-toolbar-v6__actions { justify-content: flex-end; }
}
</style>
