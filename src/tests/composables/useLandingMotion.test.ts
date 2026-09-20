import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { useLandingMotion } from '@/composables/useLandingMotion'

type Motion = ReturnType<typeof useLandingMotion>

class ObserverMock {
  static instances: ObserverMock[] = []
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor(private callback: IntersectionObserverCallback) {
    ObserverMock.instances.push(this)
  }

  emit(target: Element, isIntersecting = true) {
    this.callback(
      [{ target, isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

describe('useLandingMotion', () => {
  let wrapper: VueWrapper | undefined
  let motion: Motion
  let media: MediaQueryList
  let mediaListeners: Set<EventListenerOrEventListenerObject>

  function render() {
    wrapper = mount(defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null)
        motion = useLandingMotion(root)
        return () => h('main', { ref: root }, [
          h('section', { 'data-reveal': '', 'data-top': '-100', id: 'above' }),
          h('section', { 'data-reveal': '', 'data-top': '20', id: 'hero' }),
          h('section', { 'data-reveal': '', 'data-top': '1600', id: 'below' }),
        ])
      },
    }))
    return {
      above: wrapper.get('#above').element,
      hero: wrapper.get('#hero').element,
      below: wrapper.get('#below').element,
    }
  }

  function setPreference(matches: boolean) {
    Object.defineProperty(media, 'matches', { value: matches, configurable: true })
    const event = new Event('change')
    mediaListeners.forEach((listener) => {
      if (typeof listener === 'function') listener(event)
      else listener.handleEvent(event)
    })
  }

  beforeEach(() => {
    ObserverMock.instances = []
    mediaListeners = new Set()
    media = {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn((_: string, listener: EventListenerOrEventListenerObject) => {
        mediaListeners.add(listener)
      }),
      removeEventListener: vi.fn((_: string, listener: EventListenerOrEventListenerObject) => {
        mediaListeners.delete(listener)
      }),
    } as unknown as MediaQueryList
    vi.stubGlobal('matchMedia', vi.fn(() => media))
    vi.stubGlobal('IntersectionObserver', ObserverMock)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { top: Number(this.dataset.top ?? 0) } as DOMRect
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps initially visible content visible and reveals offscreen sections only once', () => {
    const { above, hero, below } = render()
    const observer = ObserverMock.instances[0]!
    expect(above.classList.contains('is-visible')).toBe(true)
    expect(hero.classList.contains('is-visible')).toBe(true)
    expect(below.classList.contains('is-visible')).toBe(false)
    expect(motion.motionReady.value).toBe(true)
    expect(observer.observe).toHaveBeenCalledExactlyOnceWith(below)

    observer.emit(below, false)
    expect(below.classList.contains('is-visible')).toBe(false)
    observer.emit(below)
    expect(below.classList.contains('is-visible')).toBe(true)
    expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(below)
    observer.emit(below, false)
    expect(below.classList.contains('is-visible')).toBe(true)
  })

  it('reveals all on pause and never re-hides content when resumed', () => {
    const { below } = render()
    const firstObserver = ObserverMock.instances[0]!
    motion.toggleMotion()
    expect(motion.motionPaused.value).toBe(true)
    expect(motion.motionReady.value).toBe(false)
    expect(below.classList.contains('is-visible')).toBe(true)
    expect(firstObserver.disconnect).toHaveBeenCalledOnce()

    motion.toggleMotion()
    expect(motion.motionPaused.value).toBe(false)
    expect(motion.motionReady.value).toBe(true)
    expect(below.classList.contains('is-visible')).toBe(true)
    expect(ObserverMock.instances[1]!.observe).not.toHaveBeenCalled()
  })

  it('starts without reveal animation when reduced motion is preferred', () => {
    setPreference(true)
    const { below } = render()
    expect(motion.reducedMotion.value).toBe(true)
    expect(motion.motionPaused.value).toBe(false)
    expect(motion.motionReady.value).toBe(false)
    expect(ObserverMock.instances).toHaveLength(0)
    expect(below.classList.contains('is-visible')).toBe(true)
    motion.toggleMotion()
    expect(motion.motionPaused.value).toBe(false)
    expect(motion.motionReady.value).toBe(false)
  })

  it('responds to system preference changes and preserves the user pause choice', () => {
    const { below } = render()
    const observer = ObserverMock.instances[0]!
    setPreference(true)
    expect(motion.reducedMotion.value).toBe(true)
    expect(motion.motionReady.value).toBe(false)
    expect(observer.disconnect).toHaveBeenCalledOnce()
    expect(below.classList.contains('is-visible')).toBe(true)

    setPreference(false)
    expect(motion.motionReady.value).toBe(true)
    expect(ObserverMock.instances[1]!.observe).not.toHaveBeenCalled()
    motion.toggleMotion()
    setPreference(true)
    motion.toggleMotion()
    expect(motion.motionPaused.value).toBe(true)
    setPreference(false)
    expect(motion.motionReady.value).toBe(false)
    expect(motion.motionPaused.value).toBe(true)
  })

  it('keeps the complete page readable without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { below } = render()
    expect(motion.motionReady.value).toBe(false)
    expect(below.classList.contains('is-visible')).toBe(true)
    motion.toggleMotion()
    motion.toggleMotion()
    expect(motion.motionReady.value).toBe(false)
    expect(below.classList.contains('is-visible')).toBe(true)
  })

  it('still enhances when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    render()
    expect(motion.reducedMotion.value).toBe(false)
    expect(motion.motionReady.value).toBe(true)
  })

  it('cleans up observer and preference listener and ignores stale observer callbacks', () => {
    const { below } = render()
    const observer = ObserverMock.instances[0]!
    expect(mediaListeners.size).toBe(1)
    wrapper!.unmount()
    wrapper = undefined
    expect(observer.disconnect).toHaveBeenCalledOnce()
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(mediaListeners.size).toBe(0)
    expect(motion.motionReady.value).toBe(false)
    observer.emit(below)
    expect(below.classList.contains('is-visible')).toBe(false)
  })

  it('supports and releases legacy media-query listeners', () => {
    const addListener = vi.fn((listener: EventListenerOrEventListenerObject) => mediaListeners.add(listener))
    const removeListener = vi.fn((listener: EventListenerOrEventListenerObject) => mediaListeners.delete(listener))
    media = { matches: false, addListener, removeListener } as unknown as MediaQueryList
    render()
    expect(addListener).toHaveBeenCalledOnce()
    setPreference(true)
    expect(motion.reducedMotion.value).toBe(true)
    wrapper!.unmount()
    wrapper = undefined
    expect(removeListener).toHaveBeenCalledOnce()
    expect(mediaListeners.size).toBe(0)
  })
})
