import { computed } from 'vue'
import { defineStore } from 'pinia'
import {
  connectionState,
  initializeConnectivity,
  probeConnection,
} from '@/features/connectivity/state'

export const useConnectionStore = defineStore('connection', () => {
  const status = computed(() => connectionState.status)
  const isQuietlyRecovering = computed(() => status.value === 'degraded' || status.value === 'recovering')
  const shouldWarn = computed(() => status.value === 'offline')

  return {
    state: connectionState,
    status,
    isQuietlyRecovering,
    shouldWarn,
    initialize: initializeConnectivity,
    probe: probeConnection,
  }
})
