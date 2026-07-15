<template>
  <header class="page-header-v6">
    <div>
      <span v-if="eyebrow" class="page-header-v6__eyebrow">{{ eyebrow }}</span>
      <component :is="level">{{ title }}</component>
      <p v-if="description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions || $slots.default"><slot name="actions"><slot /></slot></div>
  </header>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  level: { type: String, default: 'h2', validator: value => ['h1', 'h2'].includes(value) },
})
</script>
