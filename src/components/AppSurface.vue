<template>
  <section :class="['app-surface', `app-surface--${tone}`, { 'app-surface--raised': elevation === 'raised', 'app-surface--padded': padded }]">
    <slot />
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'default' | 'soft' | 'premium'
  elevation?: 'flat' | 'raised'
  padded?: boolean
}>(), {
  tone: 'default',
  elevation: 'flat',
  padded: false,
})
</script>
