<template>
  <Transition name="app-fade" :mode="mode"><slot /></Transition>
  <Teleport to="body">
    <Transition name="route-track">
      <div v-if="trackVisible" class="route-track" aria-hidden="true">
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
let trackTimer: number | undefined

function playTrack(event: Event) {
  const detail = event instanceof CustomEvent ? event.detail as { duration?: number } : undefined
  const duration = Number(detail?.duration) || 440
  window.clearTimeout(trackTimer)
  trackVisible.value = false
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
.route-track { position: fixed; inset: 0; z-index: var(--z-overlay, 3000); overflow: hidden; pointer-events: none; }
.route-track__wash { position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, rgba(234, 240, 255, .76) 48%, rgba(252, 252, 253, .94) 62%, transparent 100%); transform: translateX(-110%); animation: route-wash 440ms var(--ease-signature, cubic-bezier(.22, 1, .36, 1)) both; }
.route-track__line { position: absolute; top: 0; bottom: 0; left: 0; width: 2px; background: var(--color-primary); box-shadow: 0 0 18px rgba(45, 95, 202, .35); animation: route-line 440ms var(--ease-signature, cubic-bezier(.22, 1, .36, 1)) both; }
.route-track-enter-active, .route-track-leave-active { transition: opacity 90ms ease; }
.route-track-enter-from, .route-track-leave-to { opacity: 0; }
@keyframes route-line { from { transform: translateX(0); opacity: 0; } 12% { opacity: 1; } to { transform: translateX(100vw); opacity: .25; } }
@keyframes route-wash { to { transform: translateX(110%); } }
@media (prefers-reduced-motion: reduce) {
  .route-track__line, .route-track__wash { animation: none; }
  .route-track { display: none; }
}
</style>
