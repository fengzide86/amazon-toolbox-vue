<template>
  <section class="update-notice" role="status" aria-label="发现应用新版本">
    <div class="update-notice__icon"><Sparkles :size="18" /></div>
    <div class="update-notice__copy">
      <strong>新版本 v{{ store.state.availableVersion }} 已准备好</strong>
      <span>{{ summary }}</span>
    </div>
    <div class="update-notice__actions">
      <button type="button" class="text-action" @click="store.deferDownload">稍后</button>
      <button type="button" class="primary-action" @click="store.openDetails">查看更新</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Sparkles } from '@lucide/vue'
import { useUpdateStore } from './store'

const store = useUpdateStore()
const summary = computed(() => store.state.releaseNotes[0] || '该版本未提供更新说明')
</script>

<style scoped>
.update-notice{position:relative;z-index:var(--z-sticky-notice);min-height:52px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;margin-bottom:16px;padding:10px 12px;border:1px solid rgba(45,95,202,.18);border-radius:var(--radius-md);color:var(--color-primary);background:var(--color-primary-soft)}
.update-notice__icon{width:32px;height:32px;display:grid;place-items:center;border-radius:9px;background:var(--color-surface)}.update-notice__copy{min-width:0;display:flex;align-items:baseline;gap:10px}.update-notice__copy strong{flex-shrink:0;color:var(--color-text);font-size:var(--type-control)}.update-notice__copy span{overflow:hidden;color:var(--color-text-secondary);font-size:var(--type-meta);text-overflow:ellipsis;white-space:nowrap}.update-notice__actions{display:flex;align-items:center;gap:6px}.update-notice button{min-height:36px;padding:0 12px;border-radius:9px;font:700 var(--type-control)/1 var(--font-family);cursor:pointer}.text-action{border:0;color:var(--color-text-secondary);background:transparent}.primary-action{border:1px solid var(--color-primary);color:#fff;background:var(--color-primary)}
@media(max-width:700px){.update-notice{grid-template-columns:auto 1fr}.update-notice__copy{display:grid;gap:2px}.update-notice__actions{grid-column:1/-1;justify-content:flex-end}.update-notice__copy span{white-space:normal}}
</style>
