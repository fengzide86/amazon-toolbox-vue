<template>
  <div v-if="!hideBanner && store.banner" class="info-banner" role="status">
    <Megaphone :size="16" />
    <div>
      <strong>{{ store.banner.title }}</strong>
      <span>{{ store.banner.content }}</span>
    </div>
    <button type="button" aria-label="不再显示这条公告" @click="store.dismiss(store.banner)"><X :size="15" /></button>
  </div>

  <Transition name="announcement-fade">
    <div
      v-if="store.critical"
      class="announcement-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="critical-announcement-title"
      aria-describedby="critical-announcement-content"
    >
      <section class="announcement-modal" :class="store.critical.severity">
        <div class="type-icon"><CircleAlert :size="24" /></div>
        <span class="type-label">{{ typeText(store.critical.category) }}</span>
        <h3 id="critical-announcement-title">{{ store.critical.title }}</h3>
        <p id="critical-announcement-content">{{ store.critical.content }}</p>
        <div class="modal-footer">
          <small>{{ formatDate(store.critical.published_at || store.critical.created_at) }}</small>
          <button type="button" autofocus @click="store.dismiss(store.critical)">我已了解</button>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { CircleAlert, Megaphone, X } from '@lucide/vue'

import { useAnnouncementStore } from '@/features/announcements/store'
import type { Announcement } from '@/features/announcements/model'

defineProps<{ hideBanner?: boolean }>()
const store = useAnnouncementStore()

function typeText(category: Announcement['category']): string {
  return category === 'maintenance' ? '维护通知' : '重要通知'
}
function formatDate(value?: string | null): string {
  return value ? new Date(value).toLocaleDateString('zh-CN') : ''
}

onMounted(() => store.load().catch(() => undefined))
</script>

<style scoped>
.info-banner{min-height:42px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:11px;margin-bottom:14px;padding:9px 12px;border:1px solid rgba(45,95,202,.16);border-radius:var(--radius-md);color:var(--color-primary);background:var(--studio-accent-bg)}.info-banner div{min-width:0;display:flex;align-items:baseline;gap:9px}.info-banner strong{flex-shrink:0;font-size:12px}.info-banner span{overflow:hidden;color:var(--studio-text-muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.info-banner button{display:grid;place-items:center;border:0;color:var(--studio-text-muted);background:transparent;cursor:pointer}
.announcement-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:rgba(24,32,51,.3);backdrop-filter:blur(5px)}.announcement-modal{width:min(430px,100%);padding:28px;border:1px solid var(--color-border);border-top:3px solid var(--color-accent);border-radius:var(--radius-xl);background:var(--color-surface);box-shadow:var(--shadow-overlay)}.announcement-modal.critical{border-top-color:var(--color-danger)}.type-icon{width:44px;height:44px;display:grid;place-items:center;margin-bottom:14px;border-radius:11px;color:var(--color-warning);background:var(--color-warning-soft)}.critical .type-icon{color:var(--color-danger);background:var(--color-danger-soft)}.type-label{color:var(--studio-text-muted);font-size:11px;font-weight:800;letter-spacing:.06em}.announcement-modal h3{margin:6px 0 10px;color:var(--studio-text-main);font-size:19px}.announcement-modal>p{margin:0;color:var(--studio-text-muted);font-size:13px;line-height:1.75;white-space:pre-wrap}.modal-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:22px;padding-top:15px;border-top:1px solid var(--studio-border)}.modal-footer small{color:var(--studio-text-muted)}.modal-footer button{min-height:38px;padding:0 16px;border:0;border-radius:9px;color:#fff;background:var(--color-primary);font-size:12px;font-weight:700;cursor:pointer}.announcement-fade-enter-active,.announcement-fade-leave-active{transition:opacity .2s ease}.announcement-fade-enter-from,.announcement-fade-leave-to{opacity:0}@media(prefers-reduced-motion:reduce){.announcement-fade-enter-active,.announcement-fade-leave-active{transition:none}}
</style>
