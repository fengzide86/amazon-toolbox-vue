<template>
  <header class="page-header-v6">
    <div class="page-header-v6__content">
      <span v-if="eyebrow" class="page-header-v6__eyebrow">{{ eyebrow }}</span>
      <component :is="level">{{ title }}</component>
      <p v-if="description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions || $slots.default" class="page-header-v6__actions">
      <slot name="actions"><slot /></slot>
    </div>
  </header>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
  eyebrow?: string
  level?: 'h1' | 'h2'
}>(), {
  description: '',
  eyebrow: '',
  level: 'h2',
})
</script>
