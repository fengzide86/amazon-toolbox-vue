import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useCompactLayout(query = '(max-width: 1024px)') {
  const isCompact = ref(false)
  let mediaQuery = null

  function update(event) {
    isCompact.value = Boolean(event?.matches ?? mediaQuery?.matches)
  }

  onMounted(() => {
    if (typeof window.matchMedia !== 'function') return
    mediaQuery = window.matchMedia(query)
    update(mediaQuery)
    mediaQuery.addEventListener?.('change', update)
  })

  onBeforeUnmount(() => mediaQuery?.removeEventListener?.('change', update))

  return isCompact
}
