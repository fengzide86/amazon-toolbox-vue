<template>
  <span
    class="kst-brand-mark"
    :class="[`is-${variant}`, { 'is-compact': compact }]"
    :style="markStyle"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : label"
    :aria-hidden="decorative ? 'true' : undefined"
    data-testid="kst-brand-mark"
  >
    <img :src="source" alt="" draggable="false">
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import kstSymbol from '@/assets/brand/kst-symbol.svg'
import kstCompactSymbol from '@/assets/brand/kst-symbol-compact.svg'

const props = withDefaults(defineProps<{
  size?: number | string
  variant?: 'normal' | 'inverse'
  compact?: boolean
  decorative?: boolean
  label?: string
}>(), {
  size: 32,
  variant: 'normal',
  compact: false,
  decorative: false,
  label: '课赛通 KST',
})

const source = computed(() => props.compact ? kstCompactSymbol : kstSymbol)
const markStyle = computed(() => {
  const size = typeof props.size === 'number' ? `${props.size}px` : props.size
  return { '--kst-mark-size': size }
})
</script>

<style scoped>
.kst-brand-mark {
  width: var(--kst-mark-size);
  height: var(--kst-mark-size);
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  box-sizing: border-box;
  line-height: 0;
}

.kst-brand-mark img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.kst-brand-mark.is-inverse img {
  filter: brightness(0) invert(1);
}
</style>
