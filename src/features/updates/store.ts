import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { updateSnapshotSchema, type UpdateSnapshot } from '@/shared/ipc/update-contract'
import { getVersionReleaseNotes } from './release-api'
import { useOverlayCoordinatorStore } from '@/features/shell/overlay-store'
import { showToast } from '@/utils'

const PROMPT_KEY = 'toolbox_update_prompt_preferences'
const DAY_MS = 24 * 60 * 60 * 1000

const emptyState: UpdateSnapshot = {
  supported: false,
  status: 'idle',
  currentVersion: '—',
  releaseNotes: [],
  canRestart: false,
}

interface PromptPreference {
  version: string
  until: number
}

function readPromptPreference(): PromptPreference | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PROMPT_KEY) || 'null')
    if (!value || typeof value !== 'object') return null
    const candidate = value as Partial<PromptPreference>
    return typeof candidate.version === 'string' && typeof candidate.until === 'number'
      ? { version: candidate.version, until: candidate.until }
      : null
  } catch {
    return null
  }
}

export const useUpdateStore = defineStore('application-updates', () => {
  const state = ref<UpdateSnapshot>({ ...emptyState })
  const initialized = ref(false)
  const installingDeferredForSession = ref(false)
  const overlay = useOverlayCoordinatorStore()
  const loadedReleaseNoteVersions = new Set<string>()
  let removeStateListener: (() => void) | undefined

  const supported = computed(() => Boolean(window.electronAPI?.updates && state.value.supported))
  const drawerOpen = computed(() => overlay.activeDrawer === 'updates')
  const displayPercent = computed(() => Math.round(state.value.percent ?? 0))
  const promptSuppressed = computed(() => {
    const version = state.value.availableVersion
    if (!version) return false
    const local = readPromptPreference()
    const localUntil = local?.version === version ? local.until : 0
    const mainUntil = state.value.promptSuppressedUntil ? Date.parse(state.value.promptSuppressedUntil) : 0
    return Math.max(localUntil, mainUntil) > Date.now()
  })
  const shouldShowNotice = computed(() => state.value.status === 'available' && !promptSuppressed.value)
  const showHeaderEntry = computed(() => supported.value && [
    'available', 'downloading', 'downloaded', 'restart_deferred', 'cancelled', 'error',
  ].includes(state.value.status))
  const shouldPromptRestart = computed(() => (
    state.value.status === 'downloaded'
    && state.value.canRestart
    && !installingDeferredForSession.value
    && !overlay.criticalAnnouncementActive
  ))

  function applySnapshot(value: unknown): void {
    const parsed = updateSnapshotSchema.safeParse(value)
    if (!parsed.success) return
    state.value = parsed.data
    void hydrateReleaseNotes(parsed.data)
  }

  async function hydrateReleaseNotes(snapshot: UpdateSnapshot): Promise<void> {
    const version = snapshot.availableVersion
    if (!version || snapshot.releaseNotes.length || loadedReleaseNoteVersions.has(version)) return
    loadedReleaseNoteVersions.add(version)
    try {
      const notes = await getVersionReleaseNotes(version)
      if (state.value.availableVersion === version && !state.value.releaseNotes.length && notes.length) {
        state.value = { ...state.value, releaseNotes: notes }
      }
    } catch {
      // Release notes are optional; update actions stay available.
    }
  }

  async function initialize(): Promise<void> {
    if (initialized.value || !window.electronAPI?.updates) return
    initialized.value = true
    removeStateListener = window.electronAPI.updates.onState(applySnapshot)
    applySnapshot(await window.electronAPI.updates.getState())
  }

  function dispose(): void {
    removeStateListener?.()
    removeStateListener = undefined
    initialized.value = false
  }

  function openDetails(): void {
    overlay.openDrawer('updates')
  }

  function closeDetails(): void {
    overlay.closeDrawer('updates')
  }

  async function checkManually(): Promise<void> {
    if (!window.electronAPI?.updates || !supported.value) {
      showToast('开发预览无需检查更新', 'info')
      return
    }
    localStorage.removeItem(PROMPT_KEY)
    installingDeferredForSession.value = false
    openDetails()
    applySnapshot(await window.electronAPI.updates.check())
    if (state.value.status === 'idle') showToast('当前已是最新版本', 'success')
  }

  async function startDownload(): Promise<void> {
    if (!window.electronAPI?.updates) return
    applySnapshot(await window.electronAPI.updates.startDownload())
  }

  async function cancelDownload(): Promise<void> {
    if (!window.electronAPI?.updates) return
    applySnapshot(await window.electronAPI.updates.cancelDownload())
  }

  async function deferDownload(): Promise<void> {
    const version = state.value.availableVersion
    if (version) localStorage.setItem(PROMPT_KEY, JSON.stringify({ version, until: Date.now() + DAY_MS }))
    const bridge = window.electronAPI?.updates
    if (bridge) applySnapshot(await bridge.defer({ phase: 'download' }))
    closeDetails()
  }

  async function deferInstall(): Promise<void> {
    installingDeferredForSession.value = true
    const bridge = window.electronAPI?.updates
    if (bridge) applySnapshot(await bridge.defer({ phase: 'install' }))
  }

  async function install(): Promise<void> {
    const bridge = window.electronAPI?.updates
    if (bridge) applySnapshot(await bridge.install())
  }

  return {
    state, supported, initialized, drawerOpen, displayPercent, promptSuppressed, shouldShowNotice,
    showHeaderEntry, shouldPromptRestart, initialize, dispose, openDetails, closeDetails, checkManually,
    startDownload, cancelDownload, deferDownload, deferInstall, install,
  }
})
