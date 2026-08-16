<template>
  <Transition name="web-update">
    <aside
      v-if="availableVersion"
      class="web-update-notice"
      role="status"
      aria-live="polite"
    >
      <span class="notice-mark"><RefreshCw :size="16" /></span>
      <div><strong>新版本已准备好</strong><small>课赛通 KST {{ availableVersion }}，刷新后启用</small></div>
      <button
        type="button"
        class="refresh-button"
        @click="refresh"
      >
        刷新更新
      </button>
      <button
        type="button"
        class="dismiss-button"
        aria-label="稍后提醒"
        @click="dismiss"
      >
        <X :size="15" />
      </button>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RefreshCw, X } from '@lucide/vue'

import { getRuntimeCapabilities } from '@/runtime/capabilities'
import { compareVersions, fetchWebVersion } from './web-version'

const CHECK_INTERVAL_MS = 5 * 60 * 1000
const availableVersion = ref('')
let interval: ReturnType<typeof setInterval> | undefined

async function check(): Promise<void> {
  if (getRuntimeCapabilities().kind !== 'web') return
  try {
    const latest = await fetchWebVersion()
    const dismissed = sessionStorage.getItem('kst_web_update_dismissed')
    if (compareVersions(latest.version, import.meta.env.VITE_APP_VERSION || '0.0.0') > 0 && dismissed !== latest.version) {
      availableVersion.value = latest.version
    }
  } catch {
    // Version discovery must never block or disturb the active page.
  }
}

function handleFocus(): void {
  void check()
}

function refresh(): void {
  window.location.reload()
}

function dismiss(): void {
  if (availableVersion.value) sessionStorage.setItem('kst_web_update_dismissed', availableVersion.value)
  availableVersion.value = ''
}

onMounted(() => {
  if (getRuntimeCapabilities().kind !== 'web') return
  void check()
  interval = setInterval(() => void check(), CHECK_INTERVAL_MS)
  window.addEventListener('focus', handleFocus)
})

onUnmounted(() => {
  if (interval) clearInterval(interval)
  window.removeEventListener('focus', handleFocus)
})
</script>

<style scoped>
.web-update-notice{position:fixed;right:18px;bottom:18px;z-index:1900;max-width:min(460px,calc(100vw - 28px));display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:11px;padding:11px 12px;border:1px solid rgba(45,95,202,.2);border-radius:13px;background:rgba(252,252,253,.97);box-shadow:var(--shadow-overlay);backdrop-filter:blur(16px)}
.notice-mark{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;color:var(--color-primary);background:var(--color-primary-soft)}
.web-update-notice>div{display:grid;gap:2px}.web-update-notice strong{color:var(--color-text);font-size:var(--type-control)}.web-update-notice small{color:var(--color-text-tertiary);font-size:var(--type-micro)}
.web-update-notice button{border:0;cursor:pointer}.refresh-button{min-height:34px;padding:0 12px;border-radius:9px!important;color:#fff;background:var(--color-primary);font-size:var(--type-meta);font-weight:750}.dismiss-button{width:30px;height:30px;display:grid;place-items:center;border-radius:8px!important;color:var(--color-text-tertiary);background:transparent}.dismiss-button:hover{color:var(--color-text);background:var(--color-surface-soft)}
.web-update-enter-active,.web-update-leave-active{transition:opacity var(--motion-normal),transform var(--motion-normal)}.web-update-enter-from,.web-update-leave-to{opacity:0;transform:translateY(8px)}
@media(max-width:560px){.web-update-notice{right:14px;bottom:14px;grid-template-columns:auto 1fr auto}.refresh-button{grid-column:2}.dismiss-button{grid-column:3;grid-row:1}}
@media(prefers-reduced-motion:reduce){.web-update-enter-active,.web-update-leave-active{transition:none}}
</style>
