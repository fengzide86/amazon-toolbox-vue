<template>
  <section :class="['app-surface', `app-surface--${tone}`, { 'app-surface--raised': elevation === 'raised', 'app-surface--padded': padded }]">
    <slot />
  </section>
</template>

<script setup>
defineProps({
  tone: { type: String, default: 'default', validator: value => ['default', 'soft', 'premium'].includes(value) },
  elevation: { type: String, default: 'flat', validator: value => ['flat', 'raised'].includes(value) },
  padded: { type: Boolean, default: false },
})
</script>
