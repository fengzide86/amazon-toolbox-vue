<template>
  <el-drawer
    :model-value="modelValue"
    :title="title"
    :size="size"
    class="admin-detail-drawer"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="admin-detail-drawer__body"><slot /></div>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </el-drawer>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, required: true },
  size: { type: String, default: 'min(460px, 92vw)' },
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
.admin-detail-drawer__body { display: flex; flex-direction: column; gap: var(--space-3); }
</style>
