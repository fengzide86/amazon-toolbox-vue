<template>
  <div v-if="infoAnnouncement" class="info-banner" role="status">
    <Megaphone :size="16" />
    <div><strong>{{ infoAnnouncement.title }}</strong><span>{{ infoAnnouncement.content }}</span></div>
    <button type="button" aria-label="关闭公告" @click="dismissInfo"><X :size="15" /></button>
  </div>

  <transition name="fade">
    <div v-if="showModal && currentAnnouncement" class="announcement-overlay" role="dialog" aria-modal="true" @click.self="dismissCritical">
      <div class="announcement-modal" :class="currentAnnouncement.type">
        <button class="modal-close-btn" type="button" aria-label="关闭公告" @click="dismissCritical"><X :size="18" /></button>
        <div class="type-icon"><CircleAlert :size="24" /></div>
        <span class="type-label">{{ typeText(currentAnnouncement.type) }}</span>
        <h3>{{ currentAnnouncement.title }}</h3>
        <p>{{ currentAnnouncement.content }}</p>
        <div class="modal-footer">
          <small>{{ formatDate(currentAnnouncement.created_at) }}</small>
          <button type="button" @click="dismissCritical">我知道了</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { CircleAlert, Megaphone, X } from '@lucide/vue'
import { getActiveAnnouncements } from '@/utils/api'

const criticalAnnouncements = ref([])
const infoAnnouncements = ref([])
const currentIndex = ref(0)
const showModal = ref(false)
const dismissedIds = ref([])

const currentAnnouncement = computed(() => criticalAnnouncements.value[currentIndex.value] || null)
const infoAnnouncement = computed(() => infoAnnouncements.value[0] || null)

function typeText(type) {
  return type === 'maintenance' ? '维护通知' : '重要通知'
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('zh-CN')
}

function rememberDismissed(announcement) {
  if (!announcement) return
  dismissedIds.value.push(announcement.id)
  localStorage.setItem('dismissed_announcements', JSON.stringify([...new Set(dismissedIds.value)]))
}

function dismissInfo() {
  rememberDismissed(infoAnnouncement.value)
  infoAnnouncements.value.shift()
}

function dismissCritical() {
  rememberDismissed(currentAnnouncement.value)
  if (currentIndex.value < criticalAnnouncements.value.length - 1) currentIndex.value += 1
  else showModal.value = false
}

onMounted(async () => {
  try {
    dismissedIds.value = JSON.parse(localStorage.getItem('dismissed_announcements') || '[]')
    const active = (await getActiveAnnouncements() || []).filter(item => !dismissedIds.value.includes(item.id))
    criticalAnnouncements.value = active.filter(item => ['system', 'maintenance'].includes(item.type))
    infoAnnouncements.value = active.filter(item => !['system', 'maintenance'].includes(item.type))
    showModal.value = criticalAnnouncements.value.length > 0
  } catch (error) {
    console.warn('Failed to load announcements:', error)
  }
})
</script>

<style scoped>
.info-banner {
  min-height: 40px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 8px 11px;
  border: 1px solid rgba(45, 95, 202, .14);
  border-radius: var(--radius-md);
  color: var(--color-primary);
  background: var(--studio-accent-bg);
}
.info-banner div { min-width: 0; display: flex; align-items: baseline; gap: 9px; }
.info-banner strong { flex-shrink: 0; font-size: 12px; }
.info-banner span { overflow: hidden; color: var(--studio-text-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.info-banner button, .modal-close-btn { display: grid; place-items: center; border: 0; color: var(--studio-text-muted); background: transparent; cursor: pointer; }

.announcement-overlay { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 16px; background: var(--color-overlay); backdrop-filter: blur(5px); }
.announcement-modal { position: relative; width: min(420px, 100%); padding: 28px; border: 1px solid var(--color-border); border-top: 3px solid var(--color-primary); border-radius: var(--radius-xl); background: var(--color-surface); box-shadow: var(--shadow-overlay); }
.announcement-modal.maintenance { border-top-color: var(--studio-danger); }
.modal-close-btn { position: absolute; top: 13px; right: 13px; width: 30px; height: 30px; border-radius: 7px; }
.modal-close-btn:hover { background: var(--studio-bg-hover); }
.type-icon { width: 44px; height: 44px; display: grid; place-items: center; margin-bottom: 14px; border-radius: 11px; color: var(--studio-accent); background: var(--studio-accent-bg); }
.maintenance .type-icon { color: var(--studio-danger); background: var(--color-danger-soft); }
.type-label { color: var(--studio-text-muted); font-size: 11px; font-weight: 700; }
.announcement-modal h3 { margin: 6px 0 10px; color: var(--studio-text-main); font-size: 19px; }
.announcement-modal > p { margin: 0; color: var(--studio-text-muted); font-size: 13px; line-height: 1.75; white-space: pre-wrap; }
.modal-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 22px; padding-top: 15px; border-top: 1px solid var(--studio-border); }
.modal-footer small { color: var(--studio-text-muted); }
.modal-footer button { min-height: 36px; padding: 0 15px; border: 0; border-radius: 8px; color: white; background: var(--studio-accent); font-size: 12px; font-weight: 700; cursor: pointer; }
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
