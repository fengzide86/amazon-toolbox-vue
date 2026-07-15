<template>
  <section class="tool-workspace" data-testid="tool-workspace">
    <header class="workspace-topbar">
      <div class="workspace-heading">
        <button class="icon-button" type="button" aria-label="返回工具箱" @click="closeWorkspace">
          <ArrowLeft :size="18" />
        </button>
        <div class="tool-mark"><Zap :size="18" /></div>
        <div class="tool-identity">
          <h1>{{ toolName }}</h1>
          <p>{{ platformName }} · 自动处理</p>
        </div>
      </div>

      <div class="workspace-actions">
        <span :class="['status-pill', `is-${runStatus}`]">
          <span class="status-dot"></span>{{ customerStatusText }}
        </span>
        <button v-if="isActiveRun" class="control-button danger" type="button" @click="stopRun">
          <Square :size="14" />停止操作
        </button>
        <button v-else-if="isTerminal" class="control-button" type="button" :disabled="restarting" @click="restartRun">
          <LoaderCircle v-if="restarting" :size="14" class="spin" />
          <RotateCcw v-else :size="14" />
          {{ restarting ? '正在打开…' : '重新执行' }}
        </button>
        <button v-if="isTerminal" class="control-button" type="button" @click="closeWorkspace">返回工具箱</button>
      </div>
    </header>

    <div class="workspace-body">
      <main class="browser-stage">
        <div class="browser-frame">
          <div class="browser-toolbar">
            <LockKeyhole :size="14" />
            <span>{{ displayUrl }}</span>
            <span class="browser-note">自动操作窗口</span>
          </div>

          <div class="browser-viewport">
            <div v-if="browserLoading" class="browser-loading">
              <LoaderCircle :size="28" class="spin" />
              <strong>正在打开目标页面</strong>
            </div>

            <webview
              v-if="isElectron"
              ref="webviewRef"
              :src="toolUrl"
              class="workspace-webview"
              partition="persist:tool-workspace"
            ></webview>

            <div v-else class="browser-mock" aria-label="自动处理预览页面">
              <div class="mock-site-header">
                <strong>{{ platformShortName }}</strong><span></span><i></i>
              </div>
              <div class="mock-page">
                <aside><span v-for="item in 6" :key="item"></span></aside>
                <div class="mock-content">
                  <small>控制台 / {{ toolName }}</small>
                  <h2>{{ stageItems[currentStageIndex]?.label }}</h2>
                  <p>系统正在目标页面中自动处理。</p>
                  <div class="mock-cards"><i v-for="item in 3" :key="item"></i></div>
                  <div class="mock-table"><span v-for="item in 6" :key="item"></span></div>
                </div>
              </div>
            </div>

            <div v-if="interactionLocked && !browserLoading" class="interaction-shield">
              <div><LoaderCircle :size="16" class="spin" />正在自动处理，请不要操作页面</div>
            </div>
          </div>
        </div>
      </main>

      <aside class="progress-panel">
        <template v-if="!isTerminal">
          <header class="panel-heading">
            <span>处理进度</span>
            <strong>{{ stageProgress }}</strong>
          </header>

          <ol class="stage-list">
            <li v-for="(stage, index) in stageItems" :key="stage.key" :class="stageState(index)">
              <span class="stage-icon">
                <Check v-if="stageState(index) === 'done'" :size="15" />
                <LoaderCircle v-else-if="stageState(index) === 'active'" :size="15" class="spin" />
                <span v-else>{{ index + 1 }}</span>
              </span>
              <div><strong>{{ stage.label }}</strong><p>{{ stage.description }}</p></div>
            </li>
          </ol>

          <div v-if="runStatus === 'waiting_user'" class="user-action-card">
            <CircleAlert :size="22" />
            <h3>{{ userAction?.title || '需要你完成一步' }}</h3>
            <p>{{ userAction?.instruction || '请按左侧页面提示完成操作，然后继续。' }}</p>
            <button type="button" @click="completeUserAction">我已完成，继续处理</button>
          </div>

          <div v-else class="running-note">
            <LoaderCircle :size="17" class="spin" />
            <div><strong>{{ runningMessage }}</strong><span>完成前请不要关闭窗口</span></div>
          </div>
        </template>

        <div v-else-if="runStatus === 'completed'" class="result-card success">
          <div class="result-icon"><Check :size="28" /></div>
          <h2>处理完成</h2>
          <p>自动操作已经完成，请以左侧赛训平台页面结果为准。</p>
          <button class="primary-action" type="button" @click="closeWorkspace">再用一个工具</button>
          <button class="secondary-action" type="button" @click="restartRun">再次执行</button>
        </div>

        <div v-else-if="runStatus === 'failed'" class="result-card failed">
          <div class="result-icon"><CircleAlert :size="27" /></div>
          <h2>本次操作未完成</h2>
          <p>系统已经停止后续操作，不会继续修改页面。</p>
          <div class="problem-code">问题编号：{{ problemCode }}</div>
          <button class="primary-action" type="button" @click="restartRun">重新执行</button>
          <button class="secondary-action" type="button" @click="openSupport">联系客服</button>
        </div>

        <div v-else class="result-card cancelled">
          <div class="result-icon"><Square :size="23" /></div>
          <h2>操作已停止</h2>
          <p>本次自动操作已经停止。</p>
          <button class="primary-action" type="button" @click="restartRun">重新执行</button>
          <button class="secondary-action" type="button" @click="closeWorkspace">返回工具箱</button>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  Check,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  Square,
  Zap,
} from '@lucide/vue'
import { useAppStore } from '@/stores/app'
import { useTaskRunStore } from '@/stores/taskRun'
import { createLog } from '@/utils/api'
import { createToolLaunchGrant } from '@/utils/api/tools'
import { showToast } from '@/utils'

const router = useRouter()
const appStore = useAppStore()
const taskRunStore = useTaskRunStore()
const {
  status: runStatus,
  currentStep,
  browserUrl,
  userAction,
} = storeToRefs(taskRunStore)

const webviewRef = ref(null)
const browserLoading = ref(true)
const restarting = ref(false)
const taskStarted = ref(false)
const taskStarting = ref(false)
const loggedRunIds = new Set()
let browserReadyFallback = null

const stageItems = [
  { key: 'prepare', label: '准备环境', description: '正在打开并检查目标页面' },
  { key: 'process', label: '自动处理', description: '系统按照预设流程完成操作' },
  { key: 'verify', label: '检查结果', description: '核对页面反馈和处理结果' },
  { key: 'complete', label: '完成', description: '结束本次自动操作' },
]

const toolName = computed(() => appStore.currentTool?.name || '自动化工具')
const toolUrl = computed(() => appStore.toolUrl || 'https://sellercentral.amazon.com')
const isElectron = computed(() => Boolean(window.electronAPI))
const platformName = computed(() => appStore.currentTool?.platformKey === 'aliexpress' ? '速卖通' : '亚马逊')
const platformShortName = computed(() => platformName.value === '速卖通' ? 'AliExpress' : 'amazon seller')
const isActiveRun = computed(() => ['idle', 'preparing', 'running', 'waiting_user', 'paused'].includes(runStatus.value))
const isTerminal = computed(() => ['completed', 'failed', 'cancelled'].includes(runStatus.value))
const interactionLocked = computed(() => ['preparing', 'running', 'paused'].includes(runStatus.value))
const displayUrl = computed(() => {
  const value = browserUrl.value || toolUrl.value
  try {
    const parsed = new URL(value)
    return parsed.host + parsed.pathname
  } catch {
    return value
  }
})

const currentStageIndex = computed(() => {
  if (runStatus.value === 'completed') return 3
  const stepId = currentStep.value?.id
  if (stepId === 'execute') return 1
  if (['verify', 'summary'].includes(stepId)) return 2
  return 0
})

const stageProgress = computed(() => `${Math.min(currentStageIndex.value + 1, 4)}/4`)
const runningMessage = computed(() => {
  if (runStatus.value === 'preparing' || runStatus.value === 'idle') return '正在准备自动操作'
  if (runStatus.value === 'paused') return '自动操作已暂停'
  if (currentStageIndex.value === 2) return '正在检查处理结果'
  return '正在自动处理'
})
const customerStatusText = computed(() => ({
  idle: '正在准备',
  preparing: '正在准备',
  running: '正在自动处理',
  waiting_user: '需要你的操作',
  paused: '已暂停',
  completed: '处理完成',
  failed: '本次未完成',
  cancelled: '已停止',
}[runStatus.value] || '正在处理'))
const problemCode = computed(() => {
  const source = taskRunStore.runId || taskRunStore.error?.code || 'UNKNOWN'
  return String(source).replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase() || 'UNKNOWN'
})

function stageState(index) {
  if (runStatus.value === 'completed') return 'done'
  if (index < currentStageIndex.value) return 'done'
  if (index === currentStageIndex.value) return 'active'
  return 'pending'
}

async function completeUserAction() {
  try {
    await taskRunStore.completeUserAction()
  } catch (error) {
    showToast('暂时无法继续，请重试', 'error')
  }
}

async function stopRun() {
  if (!window.confirm('确定停止本次自动操作吗？')) return
  await taskRunStore.cancel()
}

async function closeWorkspace() {
  if (isActiveRun.value && !window.confirm('自动操作尚未完成，现在退出将停止本次处理。')) return
  if (isActiveRun.value) await taskRunStore.cancel()
  taskRunStore.reset()
  await window.electronAPI?.automation?.unregisterBrowser?.()
  appStore.closeTool()
}

async function restartRun() {
  if (restarting.value) return
  restarting.value = true
  try {
    if (!window.electronAPI?.automation) {
      await taskRunStore.restart()
      return
    }
    const currentTool = appStore.currentTool
    const response = await createToolLaunchGrant(currentTool.id, {
      platformKey: currentTool.platformKey,
      deviceId: localStorage.getItem('toolbox_device_id') || '',
    })
    const grant = response?.launch_data || response?.grant
    if (!grant?.token) throw new Error('工具启动数据不完整')
    const nextTool = {
      ...currentTool,
      targetUrl: grant.target_url || currentTool.targetUrl,
      launchGrant: {
        token: grant.token,
        expiresAt: grant.expires_at || response.expires_at,
        expiresIn: response.expires_in,
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
    showToast(error?.message || '暂时无法重新执行', 'error')
  } finally {
    restarting.value = false
  }
}

async function openSupport() {
  localStorage.setItem('toolbox_support_context', JSON.stringify({
    run_id: taskRunStore.runId,
    tool_id: appStore.currentTool?.id,
    tool_name: toolName.value,
    platform_key: appStore.currentTool?.platformKey,
    error_code: taskRunStore.error?.code,
    problem_code: problemCode.value,
  }))
  await closeWorkspace()
  if (!appStore.toolVisible) router.push('/user/ai-chat')
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
    await taskRunStore.start({ ...appStore.currentTool, targetUrl: toolUrl.value })
  } catch (error) {
    showToast('自动处理启动失败，你可以重新执行或联系客服', 'error')
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
  if (!runId || loggedRunIds.has(runId) || !['completed', 'failed', 'cancelled'].includes(status)) return
  loggedRunIds.add(runId)
  const tool = taskRunStore.tool || appStore.currentTool || {}
  try {
    await createLog({
      device_id: localStorage.getItem('toolbox_device_id') || null,
      tool_name: tool.name,
      module: tool.module,
      status: status === 'completed' ? 'success' : status,
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

watch(runStatus, recordTerminalRun)

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
  color: var(--studio-text-main);
  background: #edf1f6;
}

.workspace-topbar {
  height: 58px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px;
  border-bottom: 1px solid var(--studio-border);
  background: var(--studio-surface);
}

.workspace-heading,
.workspace-actions {
  display: flex;
  align-items: center;
  gap: 9px;
}

.icon-button {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  color: var(--studio-text-muted);
  background: transparent;
  cursor: pointer;
}

.icon-button:hover { background: var(--studio-bg-hover); color: var(--studio-text-main); }
.tool-mark { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 9px; color: white; background: linear-gradient(135deg, var(--studio-accent), var(--studio-accent-hover)); }
.tool-identity h1 { margin: 0; font-size: 14px; }
.tool-identity p { margin: 2px 0 0; color: var(--studio-text-muted); font-size: 11px; }

.status-pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 10px; border-radius: 999px; color: var(--studio-accent-hover); background: var(--studio-accent-bg); font-size: 12px; font-weight: 700; }
.status-pill.is-completed { color: #047857; background: #ecfdf5; }
.status-pill.is-failed { color: #b91c1c; background: #fef2f2; }
.status-pill.is-cancelled { color: var(--studio-text-muted); background: var(--studio-bg-hover); }
.status-pill.is-waiting_user { color: #b45309; background: #fffbeb; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.is-running .status-dot, .is-preparing .status-dot { animation: pulse 1.3s infinite; }

.control-button { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 11px; border: 1px solid var(--studio-border); border-radius: 8px; color: var(--studio-text-main); background: white; font-size: 12px; font-weight: 700; cursor: pointer; }
.control-button:hover { border-color: var(--studio-accent-light); background: var(--studio-bg-hover); }
.control-button.danger { color: var(--studio-danger); }

.workspace-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 10px; padding: 10px; }
.browser-stage { min-width: 0; min-height: 0; }
.browser-frame, .progress-panel { height: 100%; overflow: hidden; border: 1px solid var(--studio-border); border-radius: 12px; background: white; box-shadow: var(--studio-shadow); }
.browser-frame { display: flex; flex-direction: column; }
.browser-toolbar { height: 42px; flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 0 14px; border-bottom: 1px solid var(--studio-border); color: var(--studio-text-muted); background: #f8fafc; font-size: 12px; }
.browser-toolbar > span:first-of-type { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.browser-note { margin-left: auto; color: var(--studio-accent-hover); font-weight: 700; }
.browser-viewport { position: relative; flex: 1; min-height: 0; }
.workspace-webview { width: 100%; height: 100%; display: flex; }
.browser-loading { position: absolute; inset: 0; z-index: 6; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; background: rgba(255,255,255,.96); }

.interaction-shield { position: absolute; inset: 0; z-index: 5; display: flex; align-items: flex-start; justify-content: center; padding-top: 14px; background: rgba(255,255,255,.015); cursor: wait; }
.interaction-shield div { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid rgba(14,165,233,.2); border-radius: 999px; color: var(--studio-accent-hover); background: rgba(255,255,255,.96); box-shadow: var(--shadow-md); font-size: 12px; font-weight: 700; }

.browser-mock { height: 100%; background: #f5f6f8; }
.mock-site-header { height: 56px; display: flex; align-items: center; gap: 24px; padding: 0 22px; color: white; background: #111827; }
.mock-site-header strong { color: var(--studio-warning); }
.mock-site-header span { width: 38%; height: 28px; border-radius: 6px; background: white; }
.mock-site-header i { width: 28px; height: 28px; margin-left: auto; border-radius: 50%; background: #475569; }
.mock-page { height: calc(100% - 56px); display: flex; }
.mock-page aside { width: 160px; display: flex; flex-direction: column; gap: 14px; padding: 24px 18px; background: white; }
.mock-page aside span { width: 80%; height: 10px; border-radius: 5px; background: #e2e8f0; }
.mock-content { flex: 1; padding: 28px; }
.mock-content small { color: #94a3b8; }
.mock-content h2 { margin: 14px 0 6px; }
.mock-content p { margin: 0; color: var(--studio-text-muted); }
.mock-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 24px; }
.mock-cards i { height: 86px; border: 1px solid var(--studio-border); border-radius: 9px; background: white; }
.mock-table { margin-top: 18px; padding: 14px 18px; border: 1px solid var(--studio-border); border-radius: 9px; background: white; }
.mock-table span { display: block; height: 9px; margin: 13px 0; border-radius: 5px; background: #e2e8f0; }

.progress-panel { display: flex; flex-direction: column; padding: 20px; }
.panel-heading { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid var(--studio-border); }
.panel-heading span { font-size: 17px; font-weight: 800; }
.panel-heading strong { color: var(--studio-text-muted); font-size: 12px; }
.stage-list { margin: 22px 0 0; padding: 0; list-style: none; }
.stage-list li { position: relative; display: grid; grid-template-columns: 30px 1fr; gap: 11px; min-height: 72px; }
.stage-list li:not(:last-child)::before { content: ''; position: absolute; top: 30px; bottom: 0; left: 14px; width: 1px; background: var(--studio-border); }
.stage-icon { position: relative; z-index: 1; width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--studio-border); border-radius: 50%; color: #94a3b8; background: white; font-size: 10px; font-weight: 800; }
.stage-list li.done .stage-icon { border-color: var(--studio-success); color: white; background: var(--studio-success); }
.stage-list li.active .stage-icon { border-color: var(--studio-accent-light); color: var(--studio-accent); background: var(--studio-accent-bg); }
.stage-list li.pending { opacity: .55; }
.stage-list strong { display: block; padding-top: 3px; font-size: 13px; }
.stage-list p { margin: 4px 0 0; color: var(--studio-text-muted); font-size: 12px; line-height: 1.5; }

.running-note, .user-action-card { margin-top: auto; border-radius: 10px; }
.running-note { display: flex; align-items: center; gap: 10px; padding: 12px; color: var(--studio-accent-hover); background: var(--studio-accent-bg); }
.running-note strong, .running-note span { display: block; }
.running-note strong { font-size: 12px; }
.running-note span { margin-top: 2px; color: var(--studio-text-muted); font-size: 11px; }
.user-action-card { padding: 16px; color: #92400e; background: #fffbeb; }
.user-action-card h3 { margin: 10px 0 6px; font-size: 15px; }
.user-action-card p { margin: 0 0 14px; color: #78350f; font-size: 12px; line-height: 1.6; }
.user-action-card button { width: 100%; min-height: 38px; border: 0; border-radius: 8px; color: white; background: var(--studio-warning); font-weight: 700; cursor: pointer; }

.result-card { margin: auto 0; text-align: center; }
.result-icon { width: 56px; height: 56px; margin: 0 auto 15px; display: grid; place-items: center; border-radius: 50%; }
.success .result-icon { color: white; background: var(--studio-success); }
.failed .result-icon { color: var(--studio-danger); background: #fef2f2; }
.cancelled .result-icon { color: var(--studio-text-muted); background: var(--studio-bg-hover); }
.result-card h2 { margin: 0 0 9px; font-size: 19px; }
.result-card p { margin: 0 0 20px; color: var(--studio-text-muted); font-size: 12px; line-height: 1.7; }
.problem-code { margin: -5px 0 18px; padding: 9px; border-radius: 7px; color: var(--studio-text-muted); background: var(--studio-bg-hover); font-size: 11px; }
.primary-action, .secondary-action { width: 100%; min-height: 40px; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer; }
.primary-action { border: 0; color: white; background: var(--studio-accent); }
.secondary-action { margin-top: 9px; border: 1px solid var(--studio-border); color: var(--studio-text-main); background: white; }

.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 50% { opacity: .4; } }

@media (max-width: 900px) {
  .workspace-body { grid-template-columns: minmax(0, 1fr) 310px; }
  .status-pill { display: none; }
}

@media (max-width: 720px) {
  .tool-identity p { display: none; }
  .workspace-body { display: flex; flex-direction: column; overflow-y: auto; }
  .browser-stage { min-height: 58vh; }
  .progress-panel { min-height: 390px; }
  .mock-page aside { display: none; }
}
</style>
