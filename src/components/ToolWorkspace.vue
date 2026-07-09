<template>
  <section class="tool-workspace" data-testid="tool-workspace">
    <header class="workspace-topbar">
      <div class="workspace-heading">
        <button class="icon-button back-button" type="button" title="返回工具箱" @click="closeWorkspace">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div class="tool-identity">
          <div class="tool-mark">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" /></svg>
          </div>
          <div>
            <h1>{{ toolName }}</h1>
            <p>{{ platformName }} · {{ isElectron ? '本地自动化任务' : '前端模拟任务' }}</p>
          </div>
        </div>
      </div>

      <div class="workspace-status">
        <span :class="['status-pill', runStatus]">
          <span class="status-dot"></span>
          {{ statusText }}
        </span>
        <span class="elapsed-time">{{ formattedElapsed }}</span>
        <button v-if="['running', 'paused'].includes(runStatus)" class="control-button" type="button" @click="togglePause">
          <svg v-if="runStatus === 'paused'" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14" /></svg>
          {{ runStatus === 'paused' ? '继续' : '暂停' }}
        </button>
        <button class="control-button" type="button" :disabled="restarting" @click="restartSimulation">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>
          {{ restarting ? '准备中' : '重新运行' }}
        </button>
        <button class="control-button danger" type="button" @click="closeWorkspace">退出</button>
      </div>
    </header>

    <div class="workspace-body">
      <main class="browser-stage">
        <div class="browser-frame">
          <div class="browser-toolbar">
            <div class="browser-controls">
              <button type="button" title="后退" @click="goBack">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <button type="button" title="前进" @click="goForward">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
              </button>
              <button type="button" title="刷新" @click="reloadBrowser">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>
              </button>
            </div>
            <div class="address-bar">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
              <span>{{ displayUrl }}</span>
            </div>
            <button class="open-external" type="button" title="在系统浏览器中打开" @click="openExternal">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
            </button>
          </div>

          <div class="browser-viewport">
            <div v-if="browserLoading" class="browser-loading">
              <span class="large-spinner"></span>
              <strong>正在打开目标页面</strong>
              <small>{{ displayUrl }}</small>
            </div>

            <webview
              v-if="isElectron"
              ref="webviewRef"
              :src="toolUrl"
              class="workspace-webview"
              partition="persist:tool-workspace"
            ></webview>

            <div v-else class="browser-mock" aria-label="模拟浏览器页面">
              <div class="mock-site-header">
                <div class="mock-logo">{{ platformShortName }}</div>
                <div class="mock-search"></div>
                <div class="mock-avatar"></div>
              </div>
              <div class="mock-page">
                <aside class="mock-nav">
                  <span v-for="n in 6" :key="n" :class="{ active: n === 2 }"></span>
                </aside>
                <div class="mock-content">
                  <div class="mock-breadcrumb">控制台 / {{ toolName }}</div>
                  <h2>{{ currentStep.title }}</h2>
                  <p>这是目标平台页面的前端演示区域。Electron 客户端中会显示真实网页。</p>
                  <div class="mock-stat-grid">
                    <div v-for="n in 3" :key="n" class="mock-stat-card"><span></span><strong>{{ 16 + n * 8 }}</strong></div>
                  </div>
                  <div class="mock-table">
                    <div class="mock-table-head"></div>
                    <div v-for="n in 5" :key="n" class="mock-table-row"><i></i><span></span><span></span><em></em></div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="runStatus === 'running'" class="action-toast">
              <span class="mini-spinner"></span>
              <div><small>工具正在操作</small><strong>{{ currentStep.action }}</strong></div>
            </div>
          </div>
        </div>
      </main>

      <aside class="activity-panel">
        <div class="panel-header">
          <div>
            <span class="eyebrow">TASK ACTIVITY</span>
            <h2>任务轨迹</h2>
          </div>
          <span class="progress-count">{{ completedCount }}/{{ steps.length }}</span>
        </div>

        <div class="progress-track"><span :style="{ width: progressPercent + '%' }"></span></div>

        <div class="panel-tabs">
          <button :class="{ active: activeTab === 'process' }" type="button" @click="activeTab = 'process'">执行过程</button>
          <button :class="{ active: activeTab === 'result' }" type="button" @click="activeTab = 'result'">任务结果</button>
        </div>

        <div v-if="activeTab === 'process'" class="panel-content">
          <div class="goal-card">
            <span>本次目标</span>
            <strong>完成「{{ toolName }}」{{ isElectron ? '本地运行' : '模拟流程' }}</strong>
            <p>当前脚本仅验证运行链路，不会提交真实数据。</p>
          </div>

          <ol class="timeline">
            <li v-for="(step, index) in steps" :key="step.id" :class="stepState(index)">
              <div class="timeline-icon">
                <svg v-if="stepState(index) === 'done'" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
                <span v-else-if="stepState(index) === 'active'" class="mini-spinner"></span>
                <span v-else>{{ index + 1 }}</span>
              </div>
              <div class="timeline-copy">
                <div class="timeline-title"><strong>{{ step.title }}</strong><time>{{ stepTime(index) }}</time></div>
                <p>{{ step.detail }}</p>
                <div v-if="stepState(index) === 'active'" class="active-action">{{ step.action }}</div>
              </div>
            </li>
          </ol>
        </div>

        <div v-else class="panel-content result-content">
          <div v-if="runStatus === 'completed'" class="result-card success">
            <div class="result-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
            </div>
            <h3>{{ isElectron ? '本地任务已完成' : '模拟任务已完成' }}</h3>
            <p>共完成 {{ steps.length }} 个步骤，浏览器与任务轨迹均运行正常。</p>
            <dl>
              <div><dt>工具</dt><dd>{{ toolName }}</dd></div>
              <div><dt>平台</dt><dd>{{ platformName }}</dd></div>
              <div><dt>耗时</dt><dd>{{ formattedElapsed }}</dd></div>
            </dl>
            <button type="button" @click="restartSimulation">再次运行</button>
          </div>
          <div v-else class="result-card waiting">
            <span class="large-spinner"></span>
            <h3>任务仍在执行</h3>
            <p>完成后，这里将汇总执行结果和生成的数据。</p>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useTaskRunStore } from '@/stores/taskRun'
import { createLog } from '@/utils/api'
import { createToolLaunchGrant } from '@/utils/api/tools'
import { showToast } from '@/utils'

const appStore = useAppStore()
const taskRunStore = useTaskRunStore()
const {
  status: runStatus,
  steps,
  currentStep,
  completedCount,
  progressPercent,
  formattedElapsed,
  statusText,
} = storeToRefs(taskRunStore)

const webviewRef = ref(null)
const browserLoading = ref(true)
const activeTab = ref('process')
const restarting = ref(false)
const taskStarted = ref(false)
const taskStarting = ref(false)
const loggedRunIds = new Set()
let browserReadyFallback = null

const toolName = computed(() => appStore.currentTool?.name || '自动化工具')
const toolUrl = computed(() => appStore.toolUrl || 'https://sellercentral.amazon.com')
const isElectron = computed(() => Boolean(window.electronAPI))
const platformName = computed(() => appStore.currentTool?.platformKey === 'aliexpress' ? '速卖通' : '亚马逊')
const platformShortName = computed(() => platformName.value === '速卖通' ? 'AliExpress' : 'amazon seller')
const displayUrl = computed(() => {
  try {
    const parsed = new URL(toolUrl.value)
    return parsed.host + parsed.pathname
  } catch {
    return toolUrl.value
  }
})

function stepState(index) {
  return steps.value[index]?.status || 'pending'
}

function stepTime(index) {
  const step = steps.value[index]
  if (!step) return ''
  if (step.completedAt) {
    return new Date(step.completedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  if (['active', 'paused'].includes(step.status)) return step.status === 'paused' ? '已暂停' : '进行中'
  return ''
}

function togglePause() {
  if (runStatus.value === 'paused') taskRunStore.resume()
  else taskRunStore.pause()
}

async function restartSimulation() {
  activeTab.value = 'process'
  if (!window.electronAPI?.automation) {
    taskRunStore.restart()
    return
  }

  const currentTool = appStore.currentTool
  if (!currentTool?.id || restarting.value) return
  restarting.value = true
  try {
    const grantResponse = await createToolLaunchGrant(currentTool.id, {
      platformKey: currentTool.platformKey,
      deviceId: localStorage.getItem('toolbox_device_id') || '',
    })
    const grant = grantResponse?.launch_data || grantResponse?.grant
    if (!grant?.token) throw new Error('新的启动授权数据不完整')

    const nextTool = {
      ...currentTool,
      targetUrl: grant.target_url || currentTool.targetUrl,
      launchGrant: {
        token: grant.token,
        expiresAt: grant.expires_at || grantResponse.expires_at,
        expiresIn: grantResponse.expires_in,
        scriptKey: grant.script_key,
        runnerApiVersion: grant.runner_api_version || 1,
        toolVersion: grant.tool_version || '1.0.0',
        toolManifest: grant.tool_manifest,
        toolSignature: grant.tool_signature,
        signingKeyId: grant.signing_key_id,
        signatureRequired: Boolean(grant.signature_required),
      },
    }
    appStore.currentTool = nextTool
    appStore.toolUrl = nextTool.targetUrl
    await taskRunStore.start(nextTool)
  } catch (error) {
    showToast(error?.message || '重新运行失败', 'error')
  } finally {
    restarting.value = false
  }
}

function closeWorkspace() {
  taskRunStore.cancel()
  taskRunStore.reset()
  window.electronAPI?.automation?.unregisterBrowser?.()
  appStore.closeTool()
}

function reloadBrowser() {
  webviewRef.value?.reload?.()
}

function goBack() {
  if (webviewRef.value?.canGoBack?.()) webviewRef.value.goBack()
}

function goForward() {
  if (webviewRef.value?.canGoForward?.()) webviewRef.value.goForward()
}

function openExternal() {
  if (window.electronAPI?.openExternal) window.electronAPI.openExternal(toolUrl.value)
  else window.open(toolUrl.value, '_blank', 'noopener,noreferrer')
}

async function startTaskWithBrowser() {
  if (taskStarted.value || taskStarting.value) return
  taskStarting.value = true
  const webview = webviewRef.value
  if (isElectron.value && webview?.getWebContentsId && window.electronAPI?.automation?.registerBrowser) {
    try {
      await window.electronAPI.automation.registerBrowser(webview.getWebContentsId())
    } catch (error) {
      console.warn('[ToolWorkspace] 嵌入浏览器注册失败，将使用独立浏览器:', error?.message || error)
    }
  }

  taskStarted.value = true
  if (browserReadyFallback) clearTimeout(browserReadyFallback)
  try {
    await taskRunStore.start({
      ...appStore.currentTool,
      targetUrl: toolUrl.value,
    })
  } catch (error) {
    taskRunStore.reset()
    showToast(error?.message || '本地 Runner 启动失败', 'error')
  } finally {
    taskStarting.value = false
  }
}

function bindWebviewEvents() {
  const webview = webviewRef.value
  if (!webview?.addEventListener) {
    browserLoading.value = false
    startTaskWithBrowser()
    return
  }
  webview.addEventListener('did-start-loading', () => { browserLoading.value = true })
  webview.addEventListener('did-stop-loading', () => { browserLoading.value = false })
  webview.addEventListener('did-fail-load', () => { browserLoading.value = false })
  webview.addEventListener('dom-ready', startTaskWithBrowser, { once: true })

  try {
    if (webview.getWebContentsId?.()) startTaskWithBrowser()
  } catch {}
}

async function recordTerminalRun(status) {
  const runId = taskRunStore.runId
  if (!runId || loggedRunIds.has(runId) || !['completed', 'failed'].includes(status)) return
  loggedRunIds.add(runId)

  const tool = taskRunStore.tool || appStore.currentTool || {}
  try {
    await createLog({
      device_id: localStorage.getItem('toolbox_device_id') || null,
      tool_name: tool.name,
      module: tool.module,
      status: status === 'completed' ? 'success' : 'failed',
      error_code: status === 'failed' ? (taskRunStore.error?.code || 'AUTOMATION_FAILED') : null,
      detail: JSON.stringify({
        run_id: runId,
        tool_id: tool.id,
        platform_key: tool.platformKey,
        script_key: tool.launchGrant?.scriptKey,
        elapsed_seconds: taskRunStore.elapsedSeconds,
      }),
    })
  } catch (error) {
    console.warn('[TaskRun] 运行日志上报失败:', error?.message || error)
  }
}

onMounted(() => {
  if (!isElectron.value) {
    browserLoading.value = false
    startTaskWithBrowser()
    return
  }
  nextTick(bindWebviewEvents)
  browserReadyFallback = setTimeout(startTaskWithBrowser, 6000)
})

watch(runStatus, status => {
  if (status === 'completed') activeTab.value = 'result'
  recordTerminalRun(status)
})

onUnmounted(() => {
  if (browserReadyFallback) clearTimeout(browserReadyFallback)
  window.electronAPI?.automation?.unregisterBrowser?.()
  taskRunStore.reset()
})
</script>

<style scoped>
.tool-workspace {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #172033;
  background: #edf1f6;
}

button { font: inherit; }
svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

.workspace-topbar {
  height: 62px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 18px;
  background: #fff;
  border-bottom: 1px solid #dfe5ed;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.04);
  z-index: 20;
}

.workspace-heading, .workspace-status, .tool-identity { display: flex; align-items: center; }
.workspace-heading { gap: 12px; min-width: 0; }
.workspace-status { gap: 8px; }

.icon-button, .browser-controls button, .open-external {
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.icon-button { width: 34px; height: 34px; border-radius: 9px; }
.icon-button:hover, .browser-controls button:hover, .open-external:hover { background: #eef2f7; color: #0f172a; }
.tool-identity { gap: 10px; min-width: 0; }
.tool-mark { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #4f46e5, #7c3aed); box-shadow: 0 7px 16px rgba(79, 70, 229, .22); }
.tool-mark svg { width: 17px; }
.tool-identity h1 { margin: 0; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tool-identity p { margin: 2px 0 0; color: #8491a5; font-size: 11px; }

.status-pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.status-pill.running { color: #2563eb; background: #eff6ff; }
.status-pill.paused { color: #b45309; background: #fffbeb; }
.status-pill.completed { color: #047857; background: #ecfdf5; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 14%, transparent); }
.status-pill.running .status-dot { animation: pulse 1.4s infinite; }
.elapsed-time { width: 42px; color: #64748b; font-size: 12px; font-variant-numeric: tabular-nums; }
.control-button { height: 32px; display: inline-flex; align-items: center; gap: 6px; padding: 0 11px; border: 1px solid #dfe5ed; border-radius: 8px; background: #fff; color: #475569; font-size: 12px; font-weight: 600; cursor: pointer; }
.control-button svg { width: 14px; height: 14px; }
.control-button:hover { border-color: #a8b4c6; background: #f8fafc; }
.control-button.danger { color: #dc2626; }

.workspace-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 370px; gap: 10px; padding: 10px; }
.browser-stage { min-width: 0; min-height: 0; }
.browser-frame { height: 100%; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #d9e0e9; border-radius: 12px; background: #fff; box-shadow: 0 8px 30px rgba(15, 23, 42, .07); }
.browser-toolbar { height: 45px; flex-shrink: 0; display: grid; grid-template-columns: auto minmax(180px, 680px) auto; align-items: center; justify-content: center; gap: 12px; padding: 0 12px; background: #f8fafc; border-bottom: 1px solid #e5eaf0; }
.browser-controls { display: flex; gap: 2px; }
.browser-controls button, .open-external { width: 28px; height: 28px; border-radius: 7px; }
.browser-controls svg, .open-external svg { width: 15px; height: 15px; }
.address-bar { height: 30px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid #e0e6ee; border-radius: 8px; background: #fff; color: #56657a; font-size: 12px; overflow: hidden; }
.address-bar svg { width: 13px; height: 13px; color: #16a34a; flex-shrink: 0; }
.address-bar span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.browser-viewport { position: relative; flex: 1; min-height: 0; background: #fff; }
.workspace-webview { display: flex; width: 100%; height: 100%; }

.browser-loading { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; background: rgba(255,255,255,.94); color: #334155; }
.browser-loading small { color: #94a3b8; }
.large-spinner, .mini-spinner { display: inline-block; border: 2px solid #dbeafe; border-top-color: #4f46e5; border-radius: 50%; animation: spin .8s linear infinite; }
.large-spinner { width: 28px; height: 28px; }
.mini-spinner { width: 13px; height: 13px; flex-shrink: 0; }

.browser-mock { height: 100%; display: flex; flex-direction: column; background: #f6f7f9; }
.mock-site-header { height: 58px; flex-shrink: 0; display: flex; align-items: center; gap: 28px; padding: 0 24px; color: #fff; background: #111827; }
.mock-logo { font-size: 17px; font-weight: 700; color: #ffb11b; }
.mock-search { width: 38%; height: 28px; border-radius: 6px; background: #fff; opacity: .92; }
.mock-avatar { width: 28px; height: 28px; margin-left: auto; border-radius: 50%; background: #475569; }
.mock-page { flex: 1; min-height: 0; display: flex; }
.mock-nav { width: 164px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; padding: 24px 18px; background: #fff; border-right: 1px solid #e5e7eb; }
.mock-nav span { width: 80%; height: 10px; border-radius: 5px; background: #dfe5ed; }
.mock-nav span.active { width: 100%; height: 28px; background: #fff3d6; }
.mock-content { flex: 1; min-width: 0; padding: 28px; }
.mock-breadcrumb { color: #94a3b8; font-size: 11px; }
.mock-content h2 { margin: 14px 0 6px; font-size: 22px; }
.mock-content p { margin: 0 0 24px; color: #64748b; font-size: 13px; }
.mock-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.mock-stat-card { min-height: 86px; padding: 17px; border: 1px solid #e5e7eb; border-radius: 9px; background: #fff; box-shadow: 0 2px 6px rgba(15,23,42,.03); }
.mock-stat-card span { display: block; width: 42%; height: 8px; margin-bottom: 14px; border-radius: 4px; background: #e2e8f0; }
.mock-stat-card strong { font-size: 24px; }
.mock-table { margin-top: 18px; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 9px; background: #fff; }
.mock-table-head { height: 38px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; }
.mock-table-row { height: 50px; display: grid; grid-template-columns: 24px 1fr 1fr 54px; align-items: center; gap: 20px; padding: 0 18px; border-bottom: 1px solid #f1f5f9; }
.mock-table-row i { width: 15px; height: 15px; border: 1px solid #cbd5e1; border-radius: 4px; }
.mock-table-row span { height: 8px; border-radius: 4px; background: #e2e8f0; }
.mock-table-row em { height: 20px; border-radius: 10px; background: #dcfce7; }
.action-toast { position: absolute; left: 18px; bottom: 18px; z-index: 4; max-width: 360px; display: flex; align-items: center; gap: 11px; padding: 10px 14px; border: 1px solid rgba(99,102,241,.18); border-radius: 10px; background: rgba(255,255,255,.96); box-shadow: 0 12px 28px rgba(15,23,42,.16); }
.action-toast small, .action-toast strong { display: block; }
.action-toast small { margin-bottom: 2px; color: #7c8ba1; font-size: 10px; }
.action-toast strong { color: #334155; font-size: 12px; }

.activity-panel { min-height: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #d9e0e9; border-radius: 12px; background: #fff; box-shadow: 0 8px 30px rgba(15, 23, 42, .07); }
.panel-header { display: flex; align-items: flex-end; justify-content: space-between; padding: 18px 18px 12px; }
.eyebrow { color: #7c8ba1; font-size: 9px; font-weight: 700; letter-spacing: .12em; }
.panel-header h2 { margin: 3px 0 0; font-size: 17px; }
.progress-count { color: #64748b; font-size: 12px; font-weight: 600; }
.progress-track { height: 3px; margin: 0 18px 13px; overflow: hidden; border-radius: 3px; background: #edf1f6; }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #4f46e5, #8b5cf6); transition: width .45s ease; }
.panel-tabs { display: grid; grid-template-columns: 1fr 1fr; padding: 0 18px; border-bottom: 1px solid #e8edf3; }
.panel-tabs button { position: relative; padding: 10px 0; border: 0; background: transparent; color: #8794a7; font-size: 12px; font-weight: 600; cursor: pointer; }
.panel-tabs button.active { color: #4f46e5; }
.panel-tabs button.active::after { content: ''; position: absolute; left: 22%; right: 22%; bottom: -1px; height: 2px; border-radius: 2px; background: #4f46e5; }
.panel-content { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 18px 20px; }
.goal-card { padding: 13px 14px; border: 1px solid #e3e7ff; border-radius: 9px; background: #f7f7ff; }
.goal-card span { display: block; margin-bottom: 4px; color: #7c8ba1; font-size: 10px; }
.goal-card strong { display: block; color: #312e81; font-size: 12px; }
.goal-card p { margin: 5px 0 0; color: #7c8ba1; font-size: 10px; line-height: 1.45; }
.timeline { margin: 18px 0 0; padding: 0; list-style: none; }
.timeline li { position: relative; display: grid; grid-template-columns: 26px 1fr; gap: 10px; padding-bottom: 17px; }
.timeline li:not(:last-child)::before { content: ''; position: absolute; top: 26px; bottom: 0; left: 12px; width: 1px; background: #e2e8f0; }
.timeline-icon { position: relative; z-index: 1; width: 26px; height: 26px; display: grid; place-items: center; border: 1px solid #dfe5ed; border-radius: 50%; background: #fff; color: #94a3b8; font-size: 9px; font-weight: 700; }
.timeline-icon svg { width: 13px; height: 13px; }
.timeline li.done .timeline-icon { color: #fff; border-color: #10b981; background: #10b981; }
.timeline li.active .timeline-icon { border-color: #c7d2fe; background: #eef2ff; }
.timeline li.paused .timeline-icon { color: #d97706; border-color: #fde68a; background: #fffbeb; }
.timeline-copy { min-width: 0; padding-top: 3px; }
.timeline-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.timeline-title strong { color: #334155; font-size: 12px; }
.timeline-title time { color: #a0aabc; font-size: 9px; white-space: nowrap; }
.timeline-copy p { margin: 4px 0 0; color: #8a96a8; font-size: 10px; line-height: 1.45; }
.timeline li.pending { opacity: .55; }
.active-action { margin-top: 7px; padding: 7px 9px; border-radius: 6px; background: #f1f5f9; color: #4f46e5; font-size: 10px; }

.result-content { display: flex; }
.result-card { width: 100%; align-self: flex-start; padding: 24px 18px; text-align: center; border: 1px solid #e5eaf0; border-radius: 11px; }
.result-icon { width: 44px; height: 44px; margin: 0 auto 12px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: #10b981; }
.result-card h3 { margin: 0 0 7px; font-size: 15px; }
.result-card > p { margin: 0; color: #7c8ba1; font-size: 11px; line-height: 1.6; }
.result-card dl { margin: 20px 0; border-top: 1px solid #edf1f5; }
.result-card dl div { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #edf1f5; font-size: 11px; }
.result-card dt { color: #8a96a8; }
.result-card dd { margin: 0; color: #334155; font-weight: 600; }
.result-card button { width: 100%; padding: 9px; border: 0; border-radius: 7px; background: #4f46e5; color: #fff; font-size: 11px; font-weight: 600; cursor: pointer; }
.result-card.waiting { padding-top: 48px; padding-bottom: 48px; }
.result-card.waiting .large-spinner { margin-bottom: 14px; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 50% { opacity: .45; } }

@media (max-width: 960px) {
  .workspace-body { grid-template-columns: minmax(0, 1fr) 320px; }
  .control-button { padding: 0 8px; }
  .tool-identity p, .elapsed-time { display: none; }
}

@media (max-width: 760px) {
  .workspace-topbar { padding: 0 10px; }
  .workspace-status .status-pill, .workspace-status .control-button:not(.danger) { display: none; }
  .workspace-body { display: flex; flex-direction: column; overflow-y: auto; }
  .browser-stage { min-height: 58vh; }
  .activity-panel { min-height: 420px; }
  .mock-nav { display: none; }
  .mock-content { padding: 18px; }
}
</style>
