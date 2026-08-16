<template>
  <span
    class="kst-brand-lockup"
    :class="[`is-${layout}`, `is-${variant}`]"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : accessibleLabel"
    :aria-hidden="decorative ? 'true' : undefined"
    data-testid="kst-brand-lockup"
  >
    <img class="kst-lockup-logo" :src="logoSource" alt="" draggable="false">
    <span class="kst-lockup-subtitle">{{ resolvedSubtitle }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import kstPrimaryLogo from '@/assets/brand/kst-logo-primary.svg'
import kstHorizontalLogo from '@/assets/brand/kst-logo-horizontal.svg'
import kstInverseLogo from '@/assets/brand/kst-logo-inverse.svg'

type BrandAudience = 'consumer' | 'business' | 'admin' | 'login'

const subtitles: Record<BrandAudience, string> = {
  consumer: '个人效率工具箱',
  business: '专业批量工作台',
  admin: '运营控制中心',
  login: '跨境电商赛训效率平台',
}

const props = withDefaults(defineProps<{
  audience?: BrandAudience
  layout?: 'horizontal' | 'stacked'
  variant?: 'normal' | 'inverse'
  subtitle?: string
  decorative?: boolean
  label?: string
}>(), {
  audience: 'consumer',
  layout: 'horizontal',
  variant: 'normal',
  subtitle: undefined,
  decorative: false,
  label: '课赛通 KST',
})

const resolvedSubtitle = computed(() => props.subtitle || subtitles[props.audience])
const accessibleLabel = computed(() => `${props.label}，${resolvedSubtitle.value}`)
const logoSource = computed(() => {
  if (props.layout === 'horizontal') return kstHorizontalLogo
  return props.variant === 'inverse' ? kstInverseLogo : kstPrimaryLogo
})
</script>

<style scoped>
.kst-brand-lockup {
  min-width: 0;
  display: inline-flex;
  color: var(--color-text);
}

.kst-brand-lockup.is-horizontal {
  align-items: center;
  gap: 10px;
}

.kst-brand-lockup.is-stacked {
  align-items: flex-start;
  flex-direction: column;
  gap: 9px;
}

.kst-lockup-logo {
  display: block;
  object-fit: contain;
  object-position: left center;
  pointer-events: none;
  user-select: none;
}

.is-horizontal .kst-lockup-logo {
  width: 90px;
  height: 32px;
}

.is-stacked .kst-lockup-logo {
  width: min(100%, 240px);
  height: auto;
  max-height: 92px;
  object-position: left bottom;
}

.kst-lockup-subtitle {
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .08em;
  line-height: 1.35;
  white-space: nowrap;
}

.is-horizontal .kst-lockup-subtitle {
  max-width: 65px;
  padding-left: 10px;
  border-left: 1px solid var(--color-border-strong);
  white-space: normal;
}

.is-stacked .kst-lockup-subtitle {
  color: #765d38;
  font-size: 12px;
  letter-spacing: .12em;
}

.kst-brand-lockup.is-inverse { color: #fff; }
.kst-brand-lockup.is-inverse .kst-lockup-subtitle { color: rgba(255, 255, 255, .7); }
.kst-brand-lockup.is-inverse.is-horizontal .kst-lockup-subtitle { border-left-color: rgba(255, 255, 255, .24); }
.kst-brand-lockup.is-inverse.is-horizontal .kst-lockup-logo { filter: brightness(0) invert(1); }
</style>
