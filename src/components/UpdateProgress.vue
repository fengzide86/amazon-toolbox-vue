<template>
  <div v-if="supported" class="update-center" aria-live="polite">
    <div v-if="state.status === 'downloading'" class="download-rail">
      <span class="download-rail__fill" :style="{ width: `${state.percent ?? 0}%` }" />
    </div>

    <button
      class="update-entry"
      :class="`is-${state.status}`"
      type="button"
      :aria-expanded="panelOpen"
      aria-controls="application-update-panel"
      @click="handleEntryClick"
    >
      <span class="update-entry__mark" aria-hidden="true">↑</span>
      <span>{{ entryLabel }}</span>
      <span v-if="state.status === 'downloading'" class="update-entry__percent">{{ displayPercent }}%</span>
    </button>

    <Transition name="update-fade">
      <div v-if="panelOpen" class="update-backdrop" @mousedown.self="handleBackdrop">
        <section
          id="application-update-panel"
          ref="panelRef"
          class="update-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-title"
          tabindex="-1"
          @keydown.esc="handleEscape"
        >
          <header class="update-panel__header">
            <div class="update-emblem" aria-hidden="true">
              <span />
            </div>
            <div>
              <p class="update-eyebrow">APPLICATION UPDATE</p>
              <h2 id="update-title">{{ panelTitle }}</h2>
            </div>
            <button class="icon-button" type="button" aria-label="关闭更新面板" @click="closePanel">×</button>
          </header>

          <div class="version-track">
            <span>v{{ state.currentVersion }}</span>
            <i aria-hidden="true" />
            <strong>{{ state.availableVersion ? `v${state.availableVersion}` : '检查新版本' }}</strong>
          </div>

          <div v-if="state.status === 'downloading'" class="progress-block">
            <div class="progress-copy">
              <span>正在后台下载</span>
              <strong>{{ displayPercent }}%</strong>
            </div>
            <div class="progress-track" role="progressbar" :aria-valuenow="displayPercent" aria-valuemin="0" aria-valuemax="100">
              <span :style="{ width: `${state.percent ?? 0}%` }" />
            </div>
            <p>{{ transferredLabel }}</p>
          </div>

          <div v-else-if="state.status === 'restart_deferred'" class="notice notice--amber">
            <strong>更新已经准备好</strong>
            <span>当前仍有自动处理或批次在运行。系统不会打断工作，结束后即可安全重启。</span>
          </div>

          <div v-else-if="state.status === 'error'" class="notice notice--danger">
            <strong>本次更新未能完成</strong>
            <span>请检查网络后重新尝试。错误编号：{{ state.errorCode || 'UPDATE_ERROR' }}</span>
          </div>

          <div v-if="showReleaseNotes" class="release-notes">
            <h3>本次更新</h3>
            <ul>
              <li v-for="note in state.releaseNotes" :key="note">{{ note }}</li>
            </ul>
          </div>
          <p v-else-if="state.availableVersion" class="empty-notes">该版本未提供更新说明。</p>

          <footer class="update-actions">
            <button v-if="state.status === 'available'" class="button button--ghost" type="button" @click="deferUpdate">稍后下载</button>
            <button v-if="state.status === 'available'" class="button button--primary" type="button" @click="startDownload">下载更新</button>

            <button v-if="state.status === 'downloading'" class="button button--ghost" type="button" @click="closePanel">后台下载</button>
            <button v-if="state.status === 'downloading'" class="button button--danger" type="button" @click="cancelDownload">取消下载</button>

            <button v-if="state.status === 'downloaded'" class="button button--ghost" type="button" @click="deferUpdate">退出时安装</button>
            <button v-if="state.status === 'downloaded'" class="button button--primary" type="button" :disabled="!state.canRestart" @click="installUpdate">立即重启</button>

            <button v-if="state.status === 'restart_deferred'" class="button button--primary" type="button" @click="closePanel">知道了</button>
            <button v-if="state.status === 'error' || state.status === 'cancelled' || state.status === 'idle'" class="button button--primary" type="button" @click="checkForUpdates">重新检查</button>
          </footer>
        </section>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'

import { updateSnapshotSchema, type UpdateSnapshot } from '@/shared/ipc/update-contract'

const initialState: UpdateSnapshot = {
  status: 'idle',
  currentVersion: '—',
  releaseNotes: [],
  canRestart: false,
}

const state = ref<UpdateSnapshot>(initialState)
const panelOpen = ref(false)
const panelRef = ref<HTMLElement | null>(null)
const supported = computed(() => Boolean(window.electronAPI?.updates))
let removeStateListener: (() => void) | undefined

const displayPercent = computed(() => Math.round(state.value.percent ?? 0))
const showReleaseNotes = computed(() => state.value.releaseNotes.length > 0)
const entryLabel = computed(() => ({
  idle: '检查更新', checking: '正在检查', available: '发现新版本', downloading: '后台下载',
  downloaded: '更新已就绪', restart_deferred: '更新待重启', installing: '正在重启', cancelled: '下载已取消', error: '更新异常',
}[state.value.status]))
const panelTitle = computed(() => ({
  idle: '检查应用更新', checking: '正在检查更新', available: '新版本已经准备发布', downloading: '正在获取新版本',
  downloaded: '更新已下载完成', restart_deferred: '完成当前工作后重启', installing: '正在安全重启', cancelled: '更新下载已取消', error: '更新遇到问题',
}[state.value.status]))
const transferredLabel = computed(() => {
  if (state.value.transferredBytes == null || state.value.totalBytes == null) return '正在获取下载信息'
  return `${formatBytes(state.value.transferredBytes)} / ${formatBytes(state.value.totalBytes)}`
})

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function applySnapshot(value: unknown): void {
  const parsed = updateSnapshotSchema.safeParse(value)
  if (!parsed.success) return
  state.value = parsed.data
  if (['available', 'downloaded', 'restart_deferred'].includes(parsed.data.status)) openPanel()
}

async function openPanel(): Promise<void> {
  panelOpen.value = true
  await nextTick()
  panelRef.value?.focus()
}

function closePanel(): void { panelOpen.value = false }
function handleBackdrop(): void { if (state.value.status !== 'downloaded') closePanel() }
function handleEscape(): void { if (state.value.status !== 'downloaded') closePanel() }

async function handleEntryClick(): Promise<void> {
  if (state.value.status === 'idle') await checkForUpdates()
  else await openPanel()
}

async function checkForUpdates(): Promise<void> {
  openPanel()
  applySnapshot(await window.electronAPI?.updates?.check())
}

async function startDownload(): Promise<void> {
  applySnapshot(await window.electronAPI?.updates?.startDownload())
}

async function deferUpdate(): Promise<void> {
  applySnapshot(await window.electronAPI?.updates?.defer())
  closePanel()
}

async function installUpdate(): Promise<void> {
  applySnapshot(await window.electronAPI?.updates?.install())
}

async function cancelDownload(): Promise<void> {
  try {
    await ElMessageBox.confirm('取消后可以稍后重新下载，不会影响当前版本。', '取消更新下载？', {
      confirmButtonText: '取消下载', cancelButtonText: '继续下载', type: 'warning',
    })
    applySnapshot(await window.electronAPI?.updates?.cancelDownload())
  } catch { /* 用户继续下载 */ }
}

onMounted(async () => {
  const bridge = window.electronAPI?.updates
  if (!bridge) return
  removeStateListener = bridge.onState(applySnapshot)
  applySnapshot(await bridge.getState())
})

onUnmounted(() => removeStateListener?.())
</script>

<style scoped>
.update-center { position: relative; z-index: 3200; }
.download-rail { position: fixed; top: 0; left: 0; right: 0; height: 2px; background: #eaf0ff; z-index: 3201; }
.download-rail__fill { display: block; height: 100%; background: #2d5fca; transition: width 180ms ease; }
.update-entry { position: fixed; top: 14px; right: 78px; z-index: 3100; display: inline-flex; align-items: center; gap: 8px; min-height: 34px; padding: 0 12px; border: 1px solid #e1e5eb; border-radius: 10px; background: rgba(252,252,253,.96); color: #667085; box-shadow: 0 6px 18px rgba(24,32,51,.06); font: inherit; font-size: 12px; cursor: pointer; }
.update-entry:hover { color: #2d5fca; border-color: #b8c8ee; transform: translateY(-1px); }
.update-entry__mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 7px; background: #eaf0ff; color: #2d5fca; font-weight: 800; }
.update-entry__percent { color: #2d5fca; font-variant-numeric: tabular-nums; }
.is-available .update-entry__mark, .is-downloaded .update-entry__mark { background: #2d5fca; color: white; }
.is-error .update-entry__mark { background: #fcebed; color: #c33d49; }
.update-backdrop { position: fixed; inset: 0; z-index: 3199; display: grid; place-items: center; padding: 20px; background: rgba(24,32,51,.26); backdrop-filter: blur(5px); }
.update-panel { width: min(480px, 100%); max-height: calc(100vh - 40px); overflow: auto; padding: 24px; border: 1px solid rgba(225,229,235,.9); border-radius: 18px; outline: none; background: #fcfcfd; color: #182033; box-shadow: 0 24px 70px rgba(24,32,51,.18); }
.update-panel__header { display: grid; grid-template-columns: 48px 1fr auto; align-items: center; gap: 14px; }
.update-panel__header h2 { margin: 2px 0 0; font-size: 20px; line-height: 1.3; }
.update-eyebrow { margin: 0; color: #a98552; font-size: 10px; font-weight: 800; letter-spacing: .16em; }
.update-emblem { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: #eaf0ff; }
.update-emblem span { width: 18px; height: 18px; border: 2px solid #2d5fca; border-top-color: transparent; border-radius: 50%; transform: rotate(35deg); }
.icon-button { align-self: start; width: 32px; height: 32px; border: 0; border-radius: 9px; background: transparent; color: #667085; font-size: 22px; cursor: pointer; }
.icon-button:hover { background: #f4f5f7; color: #182033; }
.version-track { display: flex; align-items: center; gap: 12px; margin: 24px 0 18px; padding: 13px 14px; border: 1px solid #e1e5eb; border-radius: 12px; background: #f8f7f4; color: #667085; font-size: 13px; }
.version-track i { flex: 1; height: 1px; background: linear-gradient(90deg,#d5d9e0,#2d5fca); position: relative; }
.version-track strong { color: #2d5fca; }
.progress-block { margin: 18px 0; }
.progress-copy { display: flex; justify-content: space-between; margin-bottom: 9px; font-size: 13px; }
.progress-track { height: 8px; overflow: hidden; border-radius: 99px; background: #eaf0ff; }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: #2d5fca; transition: width 180ms ease; }
.progress-block p { margin: 8px 0 0; color: #667085; font-size: 12px; text-align: right; }
.release-notes { margin-top: 18px; }
.release-notes h3 { margin: 0 0 10px; font-size: 13px; }
.release-notes ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.release-notes li { position: relative; padding-left: 16px; color: #475467; font-size: 13px; line-height: 1.55; }
.release-notes li::before { content: ''; position: absolute; left: 1px; top: .62em; width: 5px; height: 5px; border-radius: 50%; background: #a98552; }
.empty-notes { margin: 18px 0 0; color: #98a2b3; font-size: 13px; }
.notice { display: grid; gap: 5px; margin: 18px 0; padding: 13px 14px; border-radius: 11px; font-size: 13px; line-height: 1.5; }
.notice--amber { background: #fff8e8; color: #855912; }
.notice--danger { background: #fcebed; color: #a52e3a; }
.update-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
.button { min-height: 38px; padding: 0 16px; border: 1px solid transparent; border-radius: 10px; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
.button--ghost { border-color: #d5d9e0; background: #fcfcfd; color: #475467; }
.button--primary { background: #2d5fca; color: white; }
.button--danger { border-color: #efc7cc; background: #fff; color: #c33d49; }
.button:disabled { opacity: .45; cursor: not-allowed; }
.update-fade-enter-active,.update-fade-leave-active { transition: opacity 180ms ease; }
.update-fade-enter-active .update-panel,.update-fade-leave-active .update-panel { transition: transform 220ms ease, opacity 180ms ease; }
.update-fade-enter-from,.update-fade-leave-to { opacity: 0; }
.update-fade-enter-from .update-panel,.update-fade-leave-to .update-panel { opacity: 0; transform: translateY(10px) scale(.985); }
@media (max-width: 900px) { .update-entry { right: 16px; top: 10px; } }
@media (prefers-reduced-motion: reduce) { .download-rail__fill,.progress-track span,.update-entry,.update-fade-enter-active,.update-fade-leave-active,.update-fade-enter-active .update-panel,.update-fade-leave-active .update-panel { transition: none; } }
</style>
