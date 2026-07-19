import {
  AUTOMATION_EVENT,
  RUN_STATUS,
  createAutomationEvent,
  type AutomationEventType,
  type AutomationStep,
  type AutomationTool,
  type RunStatus,
} from '../events'
import type { AutomationAdapter, AutomationListener } from './electronAutomationAdapter'

let runSequence = 0

export interface MockAutomationOptions {
  stepDelay?: number
}

export function createMockSteps(tool: AutomationTool = { executionMode: 'demo' }): AutomationStep[] {
  const toolName = tool.name || '自动化工具'
  const platformName = tool.platformKey === 'aliexpress' ? '速卖通' : '亚马逊'
  const targetUrl = tool.targetUrl || `demo://${tool.platformKey || 'amazon'}/${encodeURIComponent(String(tool.id || 'tool'))}`
  let displayUrl = targetUrl
  try {
    const parsed = new URL(targetUrl)
    displayUrl = parsed.host + parsed.pathname
  } catch {
    // 非标准地址保留原文用于测试与开发预览。
  }

  return [
    { id: 'prepare', title: '初始化演示场景', detail: '正在准备本地演示步骤与示例数据。', action: '检查演示配置' },
    { id: 'open', title: '展示平台界面示例', detail: `播放${platformName}本地模拟画面，不访问真实平台。`, action: `正在载入 ${displayUrl}` },
    { id: 'inspect', title: '展示状态检查', detail: '通过示例状态说明正式工具阶段的检查过程。', action: '正在播放状态检查示例' },
    { id: 'execute', title: `演示${toolName}`, detail: '按照预设脚本播放示例流程，不处理真实业务数据。', action: '正在播放业务步骤示例' },
    { id: 'verify', title: '展示结果核对', detail: '通过模拟反馈说明结果核对位置。', action: '正在播放反馈核对示例' },
    { id: 'summary', title: '整理演示结果', detail: '仅生成本次演示播放摘要。', action: '正在生成演示摘要' },
  ]
}

export class MockAutomationAdapter implements AutomationAdapter {
  private readonly stepDelay: number
  private readonly listeners = new Set<AutomationListener>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private status: RunStatus = RUN_STATUS.IDLE
  private steps: AutomationStep[] = []
  private currentIndex = 0
  private runId: string | null = null
  private tool: AutomationTool | null = null

  constructor({ stepDelay = 2200 }: MockAutomationOptions = {}) {
    this.stepDelay = stepDelay
  }

  subscribe(listener: AutomationListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(type: AutomationEventType, payload: Record<string, unknown> = {}): void {
    const event = createAutomationEvent(type, { runId: this.runId, ...payload })
    this.listeners.forEach(listener => listener(event))
  }

  start(tool: AutomationTool): string {
    this.disposeTimer()
    runSequence += 1
    this.runId = tool.demoRunId || `demo_run_local_${Date.now()}_${runSequence}`
    this.tool = { ...tool }
    this.steps = createMockSteps(tool)
    this.currentIndex = 0
    this.status = RUN_STATUS.RUNNING

    this.emit(AUTOMATION_EVENT.RUN_STARTED, { tool: this.tool, steps: this.steps, startedAt: Date.now() })
    this.emit(AUTOMATION_EVENT.BROWSER_NAVIGATED, { url: tool.targetUrl || '' })
    this.emitCurrentStep()
    this.scheduleNextStep()
    return this.runId
  }

  private emitCurrentStep(): void {
    const step = this.steps[this.currentIndex]
    if (!step) return
    this.emit(AUTOMATION_EVENT.STEP_STARTED, { step, current: this.currentIndex + 1, total: this.steps.length })
  }

  private scheduleNextStep(): void {
    this.disposeTimer()
    if (this.status !== RUN_STATUS.RUNNING) return
    this.timer = setTimeout(() => this.advance(), this.stepDelay)
  }

  private advance(): void {
    if (this.status !== RUN_STATUS.RUNNING) return
    const step = this.steps[this.currentIndex]
    if (!step) return
    this.emit(AUTOMATION_EVENT.STEP_COMPLETED, {
      stepId: step.id,
      current: this.currentIndex + 1,
      total: this.steps.length,
    })

    if (this.currentIndex >= this.steps.length - 1) {
      this.status = RUN_STATUS.COMPLETED
      this.emit(AUTOMATION_EVENT.RUN_COMPLETED, {
        result: { summary: '演示流程已走完', completedSteps: this.steps.length, recordKind: 'demo' },
      })
      this.disposeTimer()
      return
    }

    this.currentIndex += 1
    this.emitCurrentStep()
    this.scheduleNextStep()
  }

  pause(): void {
    if (this.status !== RUN_STATUS.RUNNING) return
    this.status = RUN_STATUS.PAUSED
    this.disposeTimer()
    this.emit(AUTOMATION_EVENT.RUN_PAUSED)
  }

  resume(): void {
    if (this.status !== RUN_STATUS.PAUSED) return
    this.status = RUN_STATUS.RUNNING
    this.emit(AUTOMATION_EVENT.RUN_RESUMED)
    this.scheduleNextStep()
  }

  completeUserAction(): void {}

  cancel(): void {
    if (this.status === RUN_STATUS.IDLE || this.status === RUN_STATUS.COMPLETED || this.status === RUN_STATUS.CANCELLED) return
    this.status = RUN_STATUS.CANCELLED
    this.disposeTimer()
    this.emit(AUTOMATION_EVENT.RUN_CANCELLED)
  }

  private disposeTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  dispose(): void {
    this.disposeTimer()
    this.listeners.clear()
  }
}

/** 明确命名的演示适配器；旧名称仅保留给已有测试和开发调用。 */
export class DemoAutomationAdapter extends MockAutomationAdapter {}
