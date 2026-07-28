<template>
  <Transition name="app-fade" :mode="mode"><slot /></Transition>
  <Teleport to="body">
    <Transition name="route-track">
      <div
        v-if="trackVisible"
        class="route-track"
        :style="{ '--route-track-duration': `${trackDuration}ms` }"
        aria-hidden="true"
      >
        <span class="route-track__line"></span>
        <span class="route-track__wash"></span>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

withDefaults(defineProps<{ mode?: 'in-out' | 'out-in' | 'default' }>(), { mode: 'out-in' })

const trackVisible = ref(false)
const trackDuration = ref(780)
let trackTimer: number | undefined

function playTrack(event: Event) {
  const detail = event instanceof CustomEvent ? event.detail as { duration?: number } : undefined
  const requestedDuration = Number(detail?.duration) || 780
  const duration = Math.min(Math.max(requestedDuration, 300), 1_200)
  window.clearTimeout(trackTimer)
  trackVisible.value = false
  trackDuration.value = duration
  requestAnimationFrame(() => {
    trackVisible.value = true
    trackTimer = window.setTimeout(() => { trackVisible.value = false }, duration)
  })
}

onMounted(() => window.addEventListener('toolbox:route-track', playTrack))
onBeforeUnmount(() => {
  window.removeEventListener('toolbox:route-track', playTrack)
  window.clearTimeout(trackTimer)
})
</script>

<style scoped>
.route-track { --route-track-duration: var(--motion-login-signature); position: fixed; inset: 0; z-index: var(--z-route-transition); overflow: hidden; pointer-events: none; }
.route-track__wash { position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, rgba(234, 240, 255, .48) 35%, rgba(252, 252, 253, .96) 52%, rgba(244, 238, 229, .68) 64%, transparent 100%); transform: translateX(-112%); animation: route-wash var(--route-track-duration) cubic-bezier(.4, 0, .2, 1) both; }
.route-track__line { position: absolute; top: 0; bottom: 0; left: 0; width: 2px; background: linear-gradient(180deg, transparent, var(--color-primary) 28%, var(--color-premium) 70%, transparent); box-shadow: 0 0 22px rgba(45, 95, 202, .28); animation: route-line var(--route-track-duration) cubic-bezier(.4, 0, .2, 1) both; }
.route-track-enter-active, .route-track-leave-active { transition: opacity 120ms ease; }
.route-track-enter-from, .route-track-leave-to { opacity: 0; }
@keyframes route-line { from { transform: translateX(-2px); opacity: 0; } 10% { opacity: 1; } 82% { opacity: .9; } to { transform: translateX(100vw); opacity: 0; } }
@keyframes route-wash { from { transform: translateX(-112%); } to { transform: translateX(112%); } }
@media (prefers-reduced-motion: reduce) {
  .route-track__line, .route-track__wash { animation: none; }
  .route-track { display: none; }
}
</style>
