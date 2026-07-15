<template>
  <div class="data-toolbar-v6" role="group" :aria-label="label">
    <slot />
    <div v-if="$slots.actions" class="data-toolbar-v6__actions"><slot name="actions" /></div>
  </div>
</template>

<script setup>
defineProps({ label: { type: String, default: '数据筛选与操作' } })
</script>

<style scoped>
.data-toolbar-v6__actions { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; }
@media (max-width: 640px) { .data-toolbar-v6__actions { width: 100%; margin-left: 0; } }
</style>
