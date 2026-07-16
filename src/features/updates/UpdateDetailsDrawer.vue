<template>
  <Transition name="update-drawer">
    <div v-if="visible" class="update-drawer-layer">
      <aside ref="drawerRef" class="update-drawer" role="dialog" aria-labelledby="update-drawer-title" tabindex="-1" @keydown.esc="store.closeDetails">
        <header>
          <div class="update-drawer__emblem"><Download :size="20" /></div>
          <div>
            <p>APPLICATION UPDATE</p>
            <h2 id="update-drawer-title">{{ title }}</h2>
          </div>
          <button type="button" aria-label="关闭更新详情" @click="store.closeDetails"><X :size="19" /></button>
        </header>

        <div class="version-track">
          <span>v{{ store.state.currentVersion }}</span><i aria-hidden="true" /><strong>{{ availableVersion }}</strong>
        </div>
        <p v-if="downloadSizeLabel" class="download-size">下载文件 {{ downloadSizeLabel }}</p>

        <div v-if="store.state.status === 'downloading'" class="progress-block">
          <div><span>正在后台下载</span><strong>{{ store.displayPercent }}%</strong></div>
          <div class="progress-track" role="progressbar" :aria-valuenow="store.displayPercent" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: `${store.state.percent ?? 0}%` }" />
          </div>
          <p>{{ transferredLabel }}</p>
        </div>

        <div v-else-if="store.state.status === 'restart_deferred'" class="state-notice is-warning">
          <strong>更新已准备好</strong><span>当前工作不会被打断，完成后即可安全重启。</span>
        </div>
        <div v-else-if="store.state.status === 'error'" class="state-notice is-danger">
          <strong>本次更新未能完成</strong><span>请检查网络后重新尝试。错误编号：{{ store.state.errorCode || 'UPDATE_ERROR' }}</span>
        </div>

        <section class="release-notes">
          <h3>本次更新</h3>
          <ul v-if="store.state.releaseNotes.length">
            <li v-for="note in store.state.releaseNotes" :key="note">{{ note }}</li>
          </ul>
          <p v-else>{{ store.state.availableVersion ? '该版本未提供更新说明。' : '当前已是可用版本。' }}</p>
        </section>

        <footer>
          <template v-if="store.state.status === 'available'">
            <button class="button secondary" type="button" @click="store.deferDownload">稍后</button>
            <button class="button primary" type="button" @click="store.startDownload">下载更新</button>
          </template>
          <template v-else-if="store.state.status === 'downloading'">
            <button class="button secondary" type="button" @click="store.closeDetails">后台下载</button>
            <button class="button danger" type="button" @click="confirmCancel">取消下载</button>
          </template>
          <template v-else-if="store.state.status === 'cancelled'">
            <button class="button primary" type="button" @click="store.startDownload">重新下载</button>
          </template>
          <template v-else-if="store.state.status === 'error' || store.state.status === 'idle'">
            <button class="button primary" type="button" @click="store.checkManually">重新检查</button>
          </template>
          <template v-else-if="store.state.status === 'downloaded'">
            <button class="button secondary" type="button" @click="store.deferInstall">退出时安装</button>
            <button class="button primary" type="button" :disabled="!store.state.canRestart" @click="store.install">立即重启</button>
          </template>
          <button v-else class="button primary" type="button" @click="store.closeDetails">知道了</button>
        </footer>
      </aside>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Download, X } from '@lucide/vue'
import { useAppStore } from '@/stores/app'
import { useUpdateStore } from './store'

const store = useUpdateStore()
const appStore = useAppStore()
const route = useRoute()
const drawerRef = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null
const isRestrictedRoute = computed(() => appStore.toolVisible || ['UserLogin', 'AdminLogin', 'BusinessWorkspace'].includes(String(route.name)))
const visible = computed(() => store.drawerOpen && !isRestrictedRoute.value)
watch(isRestrictedRoute, value => { if (value) store.closeDetails() })
watch(visible, async value => {
  if (value) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    drawerRef.value?.focus({ preventScroll: true })
  } else {
    returnFocus?.focus({ preventScroll: true })
    returnFocus = null
  }
})
const availableVersion = computed(() => store.state.availableVersion ? `v${store.state.availableVersion}` : '检查新版本')
const title = computed(() => ({
  idle: '检查应用更新', checking: '正在检查更新', available: '新版本已经准备发布', downloading: '正在获取新版本',
  downloaded: '更新已下载完成', restart_deferred: '完成当前工作后重启', installing: '正在安全重启',
  cancelled: '更新下载已取消', error: '更新遇到问题',
})[store.state.status])
const transferredLabel = computed(() => {
  if (store.state.transferredBytes == null || store.state.totalBytes == null) return '正在获取下载信息'
  return `${formatBytes(store.state.transferredBytes)} / ${formatBytes(store.state.totalBytes)}`
})
const downloadSizeLabel = computed(() => store.state.downloadBytes == null ? '' : formatBytes(store.state.downloadBytes))
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
async function confirmCancel(): Promise<void> {
  try {
    await ElMessageBox.confirm('取消后可以重新下载，不会影响当前版本。', '取消更新下载？', {
      confirmButtonText: '取消下载', cancelButtonText: '继续下载', type: 'warning',
    })
    await store.cancelDownload()
  } catch { /* Continue the current download. */ }
}
</script>

<style scoped>
.update-drawer-layer{position:fixed;inset:0;z-index:var(--z-drawer);background:rgba(24,32,51,.18)}.update-drawer{position:absolute;top:0;right:0;width:min(440px,100vw);height:100vh;display:flex;flex-direction:column;padding:26px;border-left:1px solid var(--color-border);outline:0;background:var(--color-surface);box-shadow:-22px 0 60px rgba(24,32,51,.14);overflow:auto}.update-drawer>header{display:grid;grid-template-columns:44px 1fr auto;align-items:center;gap:13px}.update-drawer__emblem{width:44px;height:44px;display:grid;place-items:center;border-radius:12px;color:var(--color-primary);background:var(--color-primary-soft)}.update-drawer header p{margin:0;color:var(--color-premium);font-size:var(--type-micro);font-weight:800;letter-spacing:.14em}.update-drawer h2{margin:4px 0 0;color:var(--color-text);font-size:21px}.update-drawer header>button{width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:10px;color:var(--color-text-secondary);background:transparent;cursor:pointer}.version-track{display:flex;align-items:center;gap:12px;margin:26px 0 20px;padding:14px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface-soft);font-size:var(--type-meta)}.version-track i{flex:1;height:1px;background:linear-gradient(90deg,var(--color-border-strong),var(--color-primary))}.version-track strong{color:var(--color-primary);font-size:var(--type-control)}.progress-block{padding:15px;border-radius:12px;background:var(--color-primary-soft)}.progress-block>div:first-child{display:flex;justify-content:space-between;font-size:var(--type-control)}.progress-track{height:8px;margin-top:10px;overflow:hidden;border-radius:99px;background:#dbe4f8}.progress-track span{display:block;height:100%;border-radius:inherit;background:var(--color-primary);transition:width var(--motion-fast)}.progress-block p{margin:8px 0 0;color:var(--color-text-secondary);font-size:var(--type-meta);text-align:right}.state-notice{display:grid;gap:5px;padding:14px;border-radius:12px;font-size:var(--type-control)}.state-notice span{font-size:var(--type-meta);line-height:1.6}.is-warning{color:var(--color-warning);background:var(--color-warning-soft)}.is-danger{color:var(--color-danger);background:var(--color-danger-soft)}.release-notes{margin-top:22px}.release-notes h3{margin:0 0 12px;font-size:var(--type-card)}.release-notes ul{display:grid;gap:10px;margin:0;padding-left:21px}.release-notes li,.release-notes p{color:var(--color-text-secondary);font-size:var(--type-control);line-height:1.65}.update-drawer footer{display:flex;justify-content:flex-end;gap:10px;margin-top:auto;padding-top:28px}.button{min-height:40px;padding:0 16px;border:1px solid transparent;border-radius:10px;font:700 var(--type-control)/1 var(--font-family);cursor:pointer}.primary{color:#fff;background:var(--color-primary)}.secondary{border-color:var(--color-border);color:var(--color-text-secondary);background:var(--color-surface)}.danger{border-color:rgba(195,61,73,.2);color:var(--color-danger);background:var(--color-danger-soft)}.button:disabled{opacity:.5;cursor:not-allowed}.update-drawer-enter-active,.update-drawer-leave-active{transition:opacity var(--motion-fast)}.update-drawer-enter-active .update-drawer,.update-drawer-leave-active .update-drawer{transition:transform var(--motion-normal) var(--ease-emphasized)}.update-drawer-enter-from,.update-drawer-leave-to{opacity:0}.update-drawer-enter-from .update-drawer,.update-drawer-leave-to .update-drawer{transform:translateX(28px)}
@media(max-width:768px){.update-drawer-layer{display:flex;align-items:flex-end}.update-drawer{position:relative;top:auto;right:auto;width:100%;height:auto;max-height:80vh;padding:20px;border-top:1px solid var(--color-border);border-left:0;border-radius:18px 18px 0 0}.update-drawer-enter-from .update-drawer,.update-drawer-leave-to .update-drawer{transform:translateY(28px)}}
@media(prefers-reduced-motion:reduce){.update-drawer-enter-active,.update-drawer-leave-active,.update-drawer-enter-active .update-drawer,.update-drawer-leave-active .update-drawer,.progress-track span{transition:none}}
.update-drawer-layer{background:transparent;pointer-events:none}.update-drawer{pointer-events:auto}
.download-size{margin:-10px 0 18px;color:var(--color-text-secondary);font-size:var(--type-meta);text-align:right}
</style>
