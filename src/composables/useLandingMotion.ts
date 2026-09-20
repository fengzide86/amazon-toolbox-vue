import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** Progressive enhancement: the landing page remains readable without animation APIs. */
export function useLandingMotion(root: Ref<HTMLElement | null>) {
  const motionReady = ref(false)
  const motionPaused = ref(false)
  const reducedMotion = ref(false)
  let observer: IntersectionObserver | null = null
  let mediaQuery: MediaQueryList | null = null
  let mounted = false

  function revealAll() {
    root.value?.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => {
      element.classList.add('is-visible')
    })
  }

  function disconnect() {
    observer?.disconnect()
    observer = null
    motionReady.value = false
  }

  function syncMotion() {
    disconnect()
    if (!mounted || !root.value) return
    if (motionPaused.value || reducedMotion.value || typeof IntersectionObserver !== 'function') {
      revealAll()
      return
    }

    const elements = root.value.querySelectorAll<HTMLElement>('[data-reveal]')
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight

    // Never hide content that was already visible before progressive enhancement,
    // including sections above a restored scroll position.
    elements.forEach((element) => {
      if (element.getBoundingClientRect().top <= viewportHeight) {
        element.classList.add('is-visible')
      }
    })

    const activeObserver = new IntersectionObserver((entries) => {
      // A queued browser callback may arrive after a pause or unmount.
      if (!mounted || observer !== activeObserver) return
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        activeObserver.unobserve(entry.target)
      })
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' })

    observer = activeObserver
    elements.forEach((element) => {
      if (!element.classList.contains('is-visible')) activeObserver.observe(element)
    })
    motionReady.value = true
  }

  function updatePreference() {
    reducedMotion.value = Boolean(mediaQuery?.matches)
    syncMotion()
  }

  function toggleMotion() {
    // User controls cannot override the operating system's accessibility preference.
    if (reducedMotion.value) return
    motionPaused.value = !motionPaused.value
    syncMotion()
  }

  onMounted(() => {
    mounted = true
    if (typeof window.matchMedia === 'function') {
      mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', updatePreference)
      } else {
        mediaQuery.addListener?.(updatePreference)
      }
    }
    updatePreference()
  })

  onBeforeUnmount(() => {
    mounted = false
    disconnect()
    if (typeof mediaQuery?.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', updatePreference)
    } else {
      mediaQuery?.removeListener?.(updatePreference)
    }
    mediaQuery = null
  })

  return { motionReady, motionPaused, reducedMotion, toggleMotion }
}
