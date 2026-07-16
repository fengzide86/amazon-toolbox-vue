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

export function createMockSteps(tool: AutomationTool = {}): AutomationStep[] {
  const toolName = tool.name || '自动化工具'
  const platformName = tool.platformKey === 'aliexpress' ? '速卖通' : '亚马逊'
  const targetUrl = tool.targetUrl || 'https://sellercentral.amazon.com'
  let displayUrl = targetUrl
  try {
    const parsed = new URL(targetUrl)
    displayUrl = parsed.host + parsed.pathname
  } catch {
    // 非标准地址保留原文用于测试与开发预览。
  }

  return [
    { id: 'prepare', title: '初始化工具环境', detail: '正在准备浏览器和本次任务配置。', action: '检查运行环境与工具配置' },
    { id: 'open', title: '打开目标平台', detail: `进入${platformName}目标页面。`, action: `正在访问 ${displayUrl}` },
    { id: 'inspect', title: '检查页面状态', detail: '确认页面已正常加载并准备执行任务。', action: '正在检查页面状态' },
    { id: 'execute', title: `执行${toolName}`, detail: '按照预设流程处理当前任务。', action: '正在处理业务信息' },
    { id: 'verify', title: '检查执行结果', detail: '核对页面状态，确认流程是否完整。', action: '正在核验页面反馈' },
    { id: 'summary', title: '整理任务结果', detail: '生成本次任务的结果摘要。', action: '正在生成结果报告' },
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
    this.runId = `mock_run_${Date.now()}_${runSequence}`
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
        result: { summary: '任务已完成', completedSteps: this.steps.length },
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
