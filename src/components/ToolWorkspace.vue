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
              <span class="loading-orbit"><LoaderCircle :size="25" class="spin" /></span>
              <strong>正在打开亚马逊页面</strong>
              <p>页面准备好后会自动开始处理</p>
              <span class="loading-line"></span>
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

            <div v-if="isBrowserRetryableError" class="browser-error-state">
              <span><CircleAlert :size="24" /></span>
              <strong>页面暂时没有打开</strong>
              <p>没有继续执行页面操作，可以在右侧安全地重新打开。</p>
            </div>
          </div>
        </div>
      </main>

      <aside class="progress-panel">
        <template v-if="!isTerminal">
          <header class="panel-heading">
            <span>当前进度</span>
            <strong>{{ customerStatusText }}</strong>
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
          <p>自动操作已经完成，请以左侧目标页面显示的结果为准。</p>
          <button class="primary-action" type="button" @click="closeWorkspace">再用一个工具</button>
          <button class="secondary-action" type="button" @click="restartRun">再次执行</button>
        </div>

        <div v-else-if="runStatus === 'failed'" class="result-card failed">
          <div class="result-icon"><CircleAlert :size="27" /></div>
          <h2>{{ failureTitle }}</h2>
          <p>{{ failureDescription }}</p>
          <div class="problem-code">问题编号：{{ problemCode }}</div>
          <button class="primary-action" type="button" @click="restartRun">
            {{ isBrowserRetryableError ? '重新打开并继续' : '重新执行' }}
          </button>
          <button class="secondary-action" type="button" @click="closeWorkspace">返回工具箱</button>
          <details class="technical-details">
            <summary>查看问题详情</summary>
            <p>{{ technicalError }}</p>
            <button type="button" @click="openSupport">携带问题信息联系客服</button>
          </details>
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

<script setup lang="ts">
import { ArrowLeft, Check, CircleAlert, LoaderCircle, LockKeyhole, RotateCcw, Square, Zap } from '@lucide/vue'
import { useSingleAutomationRun } from '@/features/automation/useSingleAutomationRun'

const {
  webviewRef, browserLoading, restarting, stageItems, toolName, toolUrl, isElectron,
  platformName, platformShortName, isActiveRun, isTerminal, interactionLocked, displayUrl,
  currentStageIndex, runningMessage, customerStatusText, problemCode, runStatus, userAction,
  isBrowserRetryableError, failureTitle, failureDescription, technicalError,
  stageState, completeUserAction, stopRun, closeWorkspace, restartRun, openSupport,
} = useSingleAutomationRun()
</script>

<style scoped>
.tool-workspace {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--color-text);
  background: var(--color-canvas);
  animation: workspaceTakeover var(--motion-signature) var(--ease-emphasized) both;
}

.tool-workspace::before {
  content: '';
  position: fixed;
  z-index: 80;
  top: 0;
  left: 0;
  width: 38vw;
  height: 3px;
  pointer-events: none;
  border-radius: 0 999px 999px 0;
  background: linear-gradient(90deg, transparent 0%, #8eace8 42%, var(--color-primary) 72%, transparent 100%);
  filter: drop-shadow(0 2px 5px rgba(45, 95, 202, .28));
  transform: translateX(-105%);
  animation: workspaceRail 460ms var(--ease-emphasized) both;
}

.workspace-topbar {
  height: 64px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  animation: workspaceHeaderIn 360ms var(--ease-emphasized) 40ms both;
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
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
}

.icon-button:hover { background: var(--color-primary-soft); color: var(--color-primary); }
.tool-mark { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; color: white; background: var(--color-primary); box-shadow: 0 7px 16px rgba(45,95,202,.18); }
.tool-identity h1 { margin: 0; font-size: 14px; }
.tool-identity p { margin: 2px 0 0; color: var(--color-text-secondary); font-size:var(--type-meta); }

.status-pill { display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; border-radius: 999px; color: var(--color-primary); background: var(--color-primary-soft); font-size:var(--type-control); font-weight: 700; }
.status-pill.is-running,
.status-pill.is-preparing { position: relative; }
.status-pill.is-running::after,
.status-pill.is-preparing::after { content: ''; position: absolute; inset: -2px; pointer-events: none; border: 1px solid rgba(45,95,202,.22); border-radius: inherit; animation: statusBreath var(--motion-ambient) ease-in-out infinite; }
.status-pill.is-completed { color: var(--color-success); background: var(--color-success-soft); }
.status-pill.is-failed { color: var(--color-danger); background: var(--color-danger-soft); }
.status-pill.is-cancelled { color: var(--color-text-secondary); background: var(--color-surface-soft); }
.status-pill.is-waiting_user { color: var(--color-warning); background: var(--color-warning-soft); }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.is-running .status-dot, .is-preparing .status-dot { animation: ambientPulse var(--motion-ambient) ease-in-out infinite; }

.control-button { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 11px; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text); background: white; font-size:var(--type-control); font-weight: 700; cursor: pointer; }
.control-button:hover { border-color: var(--color-primary-muted); background: var(--color-surface-soft); }
.control-button.danger { color: var(--color-danger); }

.workspace-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 336px; gap: 12px; padding: 12px; animation: workspaceBodyIn 400ms var(--ease-emphasized) 80ms both; }
.browser-stage { min-width: 0; min-height: 0; }
.browser-frame, .progress-panel { height: 100%; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-low); }
.browser-frame { display: flex; flex-direction: column; }
.browser-toolbar { height: 44px; flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 0 14px; border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); background: var(--color-surface-soft); font-size:var(--type-control); }
.browser-toolbar > span:first-of-type { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.browser-note { margin-left: auto; color: var(--color-primary-hover); font-weight: 700; }
.browser-viewport { position: relative; flex: 1; min-height: 0; }
.workspace-webview { width: 100%; height: 100%; display: flex; }
.browser-loading { position: absolute; inset: 0; z-index: 6; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 11px; background: rgba(252,252,253,.97); }
.browser-loading strong { font-size: var(--type-card); color: var(--color-text); }
.browser-loading p { margin: 0; font-size: var(--type-control); color: var(--color-text-secondary); }
.loading-orbit { width: 48px; height: 48px; display: grid; place-items: center; border: 1px solid rgba(45,95,202,.14); border-radius: 15px; color: var(--color-primary); background: var(--color-primary-soft); box-shadow: 0 12px 28px rgba(45,95,202,.1); }
.loading-line { width: 132px; height: 2px; margin-top: 6px; overflow: hidden; border-radius: 99px; background: var(--color-border); }
.loading-line::after { content: ''; display: block; width: 45%; height: 100%; border-radius: inherit; background: var(--color-primary); animation: loadingTrack 1.6s ease-in-out infinite; }

.interaction-shield { position: absolute; inset: 0; z-index: 5; display: flex; align-items: flex-start; justify-content: center; padding-top: 14px; background: rgba(255,255,255,.015); cursor: wait; }
.interaction-shield div { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid rgba(14,165,233,.2); border-radius: 999px; color: var(--color-primary-hover); background: rgba(255,255,255,.96); box-shadow: var(--shadow-medium); font-size:var(--type-control); font-weight: 700; }
.browser-error-state { position: absolute; inset: 0; z-index: 7; display: grid; place-content: center; justify-items: center; gap: 9px; padding: 24px; text-align: center; background: rgba(252,252,253,.97); animation: browserErrorIn var(--motion-normal) var(--ease-emphasized) both; }
.browser-error-state > span { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 15px; color: var(--color-danger); background: var(--color-danger-soft); }
.browser-error-state strong { font-size: var(--type-card); color: var(--color-text); }
.browser-error-state p { max-width: 360px; margin: 0; font-size: var(--type-control); line-height: 1.65; color: var(--color-text-secondary); }

.browser-mock { height: 100%; background: #f5f6f8; }
.mock-site-header { height: 56px; display: flex; align-items: center; gap: 24px; padding: 0 22px; color: white; background: #111827; }
.mock-site-header strong { color: var(--color-warning); }
.mock-site-header span { width: 38%; height: 28px; border-radius: 6px; background: white; }
.mock-site-header i { width: 28px; height: 28px; margin-left: auto; border-radius: 50%; background: #475569; }
.mock-page { height: calc(100% - 56px); display: flex; }
.mock-page aside { width: 160px; display: flex; flex-direction: column; gap: 14px; padding: 24px 18px; background: white; }
.mock-page aside span { width: 80%; height: 10px; border-radius: 5px; background: #e2e8f0; }
.mock-content { flex: 1; padding: 28px; }
.mock-content small { color: #94a3b8; }
.mock-content h2 { margin: 14px 0 6px; }
.mock-content p { margin: 0; color: var(--color-text-secondary); }
.mock-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 24px; }
.mock-cards i { height: 86px; border: 1px solid var(--color-border); border-radius: 9px; background: white; }
.mock-table { margin-top: 18px; padding: 14px 18px; border: 1px solid var(--color-border); border-radius: 9px; background: white; }
.mock-table span { display: block; height: 9px; margin: 13px 0; border-radius: 5px; background: #e2e8f0; }

.progress-panel { display: flex; flex-direction: column; padding: 22px; animation: workspacePanelIn 420ms var(--ease-emphasized) 130ms both; }
.panel-heading { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid var(--color-border); }
.panel-heading span { font-size: 17px; font-weight: 800; }
.panel-heading strong { color: var(--color-primary); font-size:var(--type-meta); }
.stage-list { margin: 22px 0 0; padding: 0; list-style: none; }
.stage-list li { position: relative; display: grid; grid-template-columns: 30px 1fr; gap: 11px; min-height: 72px; }
.stage-list li:not(:last-child)::before { content: ''; position: absolute; top: 30px; bottom: 0; left: 14px; width: 1px; background: var(--color-border); }
.stage-icon { position: relative; z-index: 1; width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--color-border); border-radius: 50%; color: #94a3b8; background: white; font-size:var(--type-micro); font-weight: 800; }
.stage-list li.done .stage-icon { border-color: var(--color-success); color: white; background: var(--color-success); }
.stage-list li.active .stage-icon { border-color: var(--color-primary-muted); color: var(--color-primary); background: var(--color-primary-soft); }
.stage-list li.pending { opacity: .55; }
.stage-list strong { display: block; padding-top: 3px; font-size: 13px; }
.stage-list p { margin: 4px 0 0; color: var(--color-text-secondary); font-size:var(--type-control); line-height: 1.5; }

.running-note, .user-action-card { margin-top: auto; border-radius: 10px; }
.running-note { display: flex; align-items: center; gap: 10px; padding: 13px; border: 1px solid rgba(45,95,202,.09); color: var(--color-primary); background: var(--color-primary-soft); }
.running-note strong, .running-note span { display: block; }
.running-note strong { font-size:var(--type-control); }
.running-note span { margin-top: 2px; color: var(--color-text-secondary); font-size:var(--type-meta); }
.user-action-card { padding: 16px; border: 1px solid rgba(183,121,31,.2); color: var(--color-warning); background: var(--color-warning-soft); animation: userAttention 520ms var(--ease-emphasized) 3; }
.user-action-card h3 { margin: 10px 0 6px; font-size: 15px; }
.user-action-card p { margin: 0 0 14px; color: #815b26; font-size:var(--type-control); line-height: 1.6; }
.user-action-card button { width: 100%; min-height: 40px; border: 0; border-radius: var(--radius-md); color: white; background: var(--color-warning); font-weight: 700; cursor: pointer; }

.result-card { margin: auto 0; text-align: center; }
.result-icon { width: 56px; height: 56px; margin: 0 auto 15px; display: grid; place-items: center; border-radius: 50%; }
.success .result-icon { color: white; background: var(--color-success); animation: resultConfirm 440ms var(--ease-emphasized) both; }
.failed .result-icon { color: var(--color-danger); background: var(--color-danger-soft); }
.cancelled .result-icon { color: var(--color-text-secondary); background: var(--color-surface-soft); }
.result-card h2 { margin: 0 0 9px; font-size: 19px; }
.result-card p { margin: 0 0 20px; color: var(--color-text-secondary); font-size:var(--type-control); line-height: 1.7; }
.problem-code { margin: -5px 0 18px; padding: 9px; border-radius: 7px; color: var(--color-text-secondary); background: var(--color-surface-soft); font-size:var(--type-meta); }
.primary-action, .secondary-action { width: 100%; min-height: 40px; border-radius: 8px; font-size:var(--type-control); font-weight: 800; cursor: pointer; }
.primary-action { border: 0; color: white; background: var(--color-primary); }
.secondary-action { margin-top: 9px; border: 1px solid var(--color-border); color: var(--color-text); background: white; }
.technical-details { margin-top: 16px; text-align: left; border-top: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: var(--type-meta); }
.technical-details summary { padding: 14px 2px 4px; cursor: pointer; font-weight: 700; }
.technical-details p { margin: 8px 0; padding: 10px; overflow-wrap: anywhere; border-radius: 8px; background: var(--color-surface-soft); font-size: var(--type-meta); line-height: 1.55; }
.technical-details button { padding: 0; border: 0; color: var(--color-primary); background: transparent; font-size: var(--type-meta); font-weight: 700; cursor: pointer; }

.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes loadingTrack { 0% { transform: translateX(-110%); } 55%,100% { transform: translateX(240%); } }
@keyframes browserErrorIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
@keyframes ambientPulse { 50% { opacity: .42; transform: scale(.82); } }
@keyframes workspaceTakeover { from { opacity: .82; transform: scale(.997); } to { opacity: 1; transform: none; } }
@keyframes workspaceRail { to { transform: translateX(365%); } }
@keyframes workspaceHeaderIn { from { opacity: .65; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
@keyframes workspaceBodyIn { from { opacity: .55; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes workspacePanelIn { from { opacity: .6; transform: translateX(14px); } to { opacity: 1; transform: none; } }
@keyframes statusBreath { 50% { opacity: .3; transform: scale(1.055); } }
@keyframes userAttention { 50% { transform: translateY(-2px); box-shadow: 0 7px 18px rgba(183,121,31,.1); } }
@keyframes resultConfirm { from { opacity: 0; transform: scale(.82); } to { opacity: 1; transform: scale(1); } }

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

@media (prefers-reduced-motion: reduce) {
  .tool-workspace,
  .workspace-topbar,
  .workspace-body,
  .progress-panel,
  .status-pill.is-running::after,
  .status-pill.is-preparing::after,
  .user-action-card,
  .browser-error-state,
  .success .result-icon { animation: none; }

  .tool-workspace::before { display: none; }
  .loading-line::after { animation: none; width: 100%; }
}
</style>
