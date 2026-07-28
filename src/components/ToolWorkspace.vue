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
          <p>{{ platformName }} · {{ isDemo ? '本地交互演示' : '比赛模拟平台自动执行' }}</p>
        </div>
      </div>

      <div class="workspace-actions">
        <span :class="['status-pill', `is-${runStatus}`]">
          <span class="status-dot"></span>{{ customerStatusText }}
        </span>
        <button v-if="isActiveRun" class="control-button danger" type="button" @click="stopRun">
          <Square :size="14" />{{ isDemo ? '停止演示' : '停止执行' }}
        </button>
        <button v-else-if="isTerminal" class="control-button" type="button" :disabled="restarting" @click="restartRun">
          <LoaderCircle v-if="restarting" :size="14" class="spin" />
          <RotateCcw v-else :size="14" />
          {{ restarting ? '正在打开…' : (isDemo ? '重新演示' : '重新执行') }}
        </button>
      </div>
    </header>

    <div class="workspace-body">
      <main class="browser-stage">
        <div class="browser-frame">
          <div class="browser-toolbar">
            <LockKeyhole :size="14" />
            <span>{{ displayUrl }}</span>
            <span class="browser-note">{{ isDemo ? '本地沙盒' : '独立本地浏览器' }}</span>
          </div>

          <div class="browser-viewport">
            <div v-if="browserLoading" class="browser-loading">
              <span class="loading-orbit"><LoaderCircle :size="25" class="spin" /></span>
              <strong>{{ isDemo ? '正在准备本地交互沙盒' : '正在启动本地自动化浏览器' }}</strong>
              <p>准备完成后会自动执行，遇到登录或验证时才会暂停</p>
              <span class="loading-line"></span>
            </div>

            <webview
              v-if="isDesktop"
              class="workspace-webview"
              src="about:blank"
              partition="persist:tool-workspace"
              aria-label="应用内自动化浏览器"
              @dom-ready="registerWorkspaceBrowser"
            />

            <div v-else class="browser-mock" aria-label="工具模拟演示页面">
              <div class="mock-site-header">
                <strong>{{ platformShortName }}</strong><span></span><i></i>
              </div>
              <div class="mock-page">
                <aside><span v-for="item in 6" :key="item"></span></aside>
                <div class="mock-content">
                  <small>控制台 / {{ toolName }}</small>
                  <h2>{{ stageItems[currentStageIndex]?.label }}</h2>
                  <p>{{ isDemo ? '可见浏览器中正在真实填写、点击并核验本地沙盒。' : '工具正在独立浏览器中操作比赛模拟平台。' }}</p>
                  <div class="mock-cards"><i v-for="item in 3" :key="item"></i></div>
                  <div class="mock-table"><span v-for="item in 6" :key="item"></span></div>
                </div>
              </div>
            </div>

            <div v-if="interactionLocked && !browserLoading" class="interaction-shield">
              <div><LoaderCircle :size="16" class="spin" />演示正在播放</div>
            </div>
          </div>
        </div>
      </main>

      <aside class="progress-panel">
        <div class="demo-disclosure" role="note">
          {{ isDemo ? '交互演示：执行真实页面操作，但数据只存在本地沙盒。' : '真实执行：只操作比赛模拟平台，登录凭据仅保存在本机。' }}
        </div>
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
            <div><strong>{{ runningMessage }}</strong><span>{{ isDemo ? '结果只代表本地沙盒操作成功' : '只有通过平台结果核验才会标记成功' }}</span></div>
          </div>
        </template>

        <div v-else-if="runStatus === 'completed'" class="result-card success">
          <div class="result-icon"><Check :size="28" /></div>
          <h2>{{ isDemo ? '交互演示已完成' : '平台任务执行成功' }}</h2>
          <p>{{ isDemo ? '本地浏览器已完成真实填写、点击和结果核验。' : '已完成页面操作并通过比赛模拟平台结果核验。' }}</p>
          <div class="result-proof-grid">
            <div><span>适配器版本</span><strong>v{{ adapterVersion }}</strong></div>
            <div><span>结果核验</span><strong>PASS</strong></div>
            <div><span>证据截图</span><strong>{{ evidenceSummary.screenshot ? '已生成' : '本地记录' }}</strong></div>
          </div>
          <section v-if="freightQuote?.selected" class="freight-result">
            <header><div><span>推荐物流方案</span><strong>{{ freightQuote.selected.carrierName }}</strong></div><b>¥{{ freightQuote.selected.totalCny?.toFixed(2) }}<small> / ${{ freightQuote.selected.totalUsd?.toFixed(2) }}</small></b></header>
            <div class="freight-breakdown"><span>计费重 <b>{{ freightQuote.selected.billableWeightKg?.toFixed(2) }}kg</b></span><span>基础运费 <b>¥{{ freightQuote.selected.baseFreightCny?.toFixed(2) }}</b></span><span>固定费 <b>¥{{ freightQuote.selected.fixedFeeCny?.toFixed(2) }}</b></span><span>附加费 <b>¥{{ freightQuote.selected.surchargeCny?.toFixed(2) }}</b></span></div>
            <small>费率包 {{ freightQuote.ratePackVersion }} · 汇率 {{ freightQuote.exchangeRateCnyPerUsd }} · 已比较 {{ freightQuote.candidates.length }} 个渠道</small>
          </section>
          <details class="execution-evidence"><summary>查看执行证据</summary><p>页面指纹：{{ evidenceSummary.fingerprint || '本地沙盒' }} · 签名：{{ evidenceSummary.signatureVerified ? '已验证' : (isDemo ? '内置演示适配器' : '等待验证记录') }}</p></details>
          <button class="primary-action" type="button" @click="closeWorkspace">返回工具箱</button>
          <button class="secondary-action" type="button" @click="restartRun">{{ isDemo ? '重新交互演示' : '使用新授权重新执行' }}</button>
        </div>

        <div v-else-if="runStatus === 'failed'" class="result-card failed">
          <div class="result-icon"><CircleAlert :size="27" /></div>
          <h2>{{ failureTitle }}</h2>
          <p>{{ failureDescription }}</p>
          <div class="problem-code">问题编号：{{ problemCode }}</div>
          <button class="primary-action" type="button" @click="restartRun">
            {{ isDemo ? '重新加载演示' : '重新获取授权并执行' }}
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
          <h2>{{ isDemo ? '已退出演示' : '自动处理已停止' }}</h2>
          <p>{{ isDemo ? '本地交互沙盒已经停止，不影响外部数据。' : '本次浏览器操作已安全停止。' }}</p>
          <button class="primary-action" type="button" @click="restartRun">{{ isDemo ? '重新演示' : '重新执行' }}</button>
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
  browserLoading, restarting, stageItems, toolName, isDemo, isDesktop,
  platformName, platformShortName, isActiveRun, isTerminal, interactionLocked, displayUrl,
  freightQuote, adapterVersion, evidenceSummary,
  currentStageIndex, runningMessage, customerStatusText, problemCode, runStatus, userAction,
  failureTitle, failureDescription, technicalError,
  stageState, completeUserAction, stopRun, closeWorkspace, restartRun, openSupport, registerWorkspaceBrowser,
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
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  animation: workspaceHeaderIn 360ms var(--ease-emphasized) 40ms both;
}

.workspace-heading,
.workspace-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.icon-button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
}

.icon-button:hover { background: var(--color-primary-soft); color: var(--color-primary); }
.tool-mark { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; color: white; background: var(--color-primary); box-shadow: 0 6px 14px rgba(45,95,202,.16); }
.tool-identity { min-width: 0; }
.tool-identity h1 { max-width: min(36vw, 420px); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
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

.control-button { min-height: 32px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text); background: white; font-size:var(--type-control); font-weight: 700; cursor:pointer; }
.control-button:hover { border-color: var(--color-primary-muted); background: var(--color-surface-soft); }
.control-button.danger { color: var(--color-danger); }

.workspace-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 326px; gap: 10px; padding: 10px; animation: workspaceBodyIn 400ms var(--ease-emphasized) 80ms both; }
.browser-stage { min-width: 0; min-height: 0; }
.browser-frame, .progress-panel { height: 100%; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-low); }
.browser-frame { display: flex; flex-direction: column; }
.browser-toolbar { height: 38px; flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--color-border); color: var(--color-text-secondary); background: var(--color-surface-soft); font-size:var(--type-meta); }
.browser-toolbar > span:first-of-type { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.browser-note { margin-left: auto; color: var(--color-primary); font-weight: 700; }
.browser-viewport { position: relative; flex: 1; min-height: 0; }
.workspace-webview { position:absolute; inset:0; width: 100%; height: 100%; display: flex; border:0; background:#fff; }
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
.mock-site-header strong { color: var(--color-execution-text); }
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

.progress-panel { display: flex; flex-direction: column; padding: 18px; animation: workspacePanelIn 420ms var(--ease-emphasized) 130ms both; }
.demo-disclosure { margin: 0 0 12px; padding: 8px 10px; border: 1px solid rgba(45,95,202,.16); border-radius: 9px; color: var(--color-primary); background: var(--color-primary-soft); font-size: var(--type-meta); line-height: 1.45; }
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
.result-proof-grid{width:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:0 0 14px}.result-proof-grid>div{display:grid;gap:3px;padding:9px;border:1px solid var(--color-border);border-radius:9px;background:var(--color-surface-soft);text-align:left}.result-proof-grid span{color:var(--color-text-tertiary);font-size:var(--type-micro)}.result-proof-grid strong{color:var(--color-text);font-size:var(--type-meta)}
.freight-result{width:100%;display:grid;gap:10px;margin:0 0 14px;padding:13px;border-radius:11px;color:var(--color-execution-text);background:linear-gradient(145deg,var(--color-ink),var(--color-ink-soft));text-align:left}.freight-result header{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}.freight-result header>div{display:grid;gap:3px}.freight-result header span,.freight-result>small{color:rgba(255,255,255,.58);font-size:var(--type-micro)}.freight-result header strong{font-size:var(--type-control)}.freight-result header>b{color:#d8c39d;font-size:19px}.freight-result header small{font-size:var(--type-meta)}.freight-breakdown{display:grid;grid-template-columns:repeat(2,1fr);gap:5px}.freight-breakdown span{display:flex;justify-content:space-between;padding:6px 7px;border:1px solid rgba(255,255,255,.08);border-radius:7px;color:rgba(255,255,255,.6);font-size:var(--type-micro)}.freight-breakdown b{color:#fff}.execution-evidence{width:100%;margin:0 0 14px;padding:9px 10px;border:1px solid var(--color-border);border-radius:9px;text-align:left}.execution-evidence summary{cursor:pointer;color:var(--color-text-secondary);font-size:var(--type-meta);font-weight:700}.execution-evidence p{margin:8px 0 0;font:var(--type-micro)/1.55 var(--font-mono);word-break:break-all}
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
