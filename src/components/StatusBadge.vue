<template><span :class="['status-badge-v6', `status-badge-v6--${status}`]"><slot>{{ label }}</slot></span></template>

<script setup>
defineProps({
  status: { type: String, default: 'neutral' },
  label: { type: String, default: '' },
})
</script>
