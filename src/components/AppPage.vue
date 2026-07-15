<template>
  <div :class="['app-page', `app-page--${width}`]">
    <slot />
  </div>
</template>

<script setup>
defineProps({
  width: { type: String, default: 'default', validator: value => ['default', 'compact', 'reading'].includes(value) },
})
</script>
