import { AUTOMATION_EVENT, RUN_STATUS, createAutomationEvent } from '../events'

let runSequence = 0

export function createMockSteps(tool = {}) {
  const toolName = tool.name || '自动化工具'
  const platformName = tool.platformKey === 'aliexpress' ? '速卖通' : '亚马逊'
  const targetUrl = tool.targetUrl || 'https://sellercentral.amazon.com'
  let displayUrl = targetUrl
  try {
    const parsed = new URL(targetUrl)
    displayUrl = parsed.host + parsed.pathname
  } catch {}

  return [
    { id: 'prepare', title: '初始化工具环境', detail: '正在准备浏览器和本次任务配置。', action: '检查运行环境与工具配置' },
    { id: 'open', title: '打开目标平台', detail: `进入${platformName}目标页面。`, action: `正在访问 ${displayUrl}` },
    { id: 'inspect', title: '读取当前页面', detail: '识别页面结构和可操作区域。', action: '正在分析页面内容' },
    { id: 'execute', title: `执行${toolName}`, detail: '按照预设流程完成页面操作。', action: '正在填写和处理模拟数据' },
    { id: 'verify', title: '检查执行结果', detail: '核对页面状态，确认流程是否完整。', action: '正在校验页面反馈' },
    { id: 'summary', title: '整理任务结果', detail: '生成本次任务的结果摘要。', action: '正在生成结果报告' },
  ]
}

export class MockAutomationAdapter {
  constructor({ stepDelay = 2200 } = {}) {
    this.stepDelay = stepDelay
    this.listeners = new Set()
    this.timer = null
    this.status = RUN_STATUS.IDLE
    this.steps = []
    this.currentIndex = 0
    this.runId = null
    this.tool = null
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(type, payload = {}) {
    const event = createAutomationEvent(type, { runId: this.runId, ...payload })
    this.listeners.forEach(listener => listener(event))
  }

  start(tool) {
    this.disposeTimer()
    runSequence += 1
    this.runId = `mock_run_${Date.now()}_${runSequence}`
    this.tool = { ...tool }
    this.steps = createMockSteps(tool)
    this.currentIndex = 0
    this.status = RUN_STATUS.RUNNING

    this.emit(AUTOMATION_EVENT.RUN_STARTED, {
      tool: this.tool,
      steps: this.steps,
      startedAt: Date.now(),
    })
    this.emit(AUTOMATION_EVENT.BROWSER_NAVIGATED, { url: tool.targetUrl || '' })
    this.emitCurrentStep()
    this.scheduleNextStep()
    return this.runId
  }

  emitCurrentStep() {
    const step = this.steps[this.currentIndex]
    if (!step) return
    this.emit(AUTOMATION_EVENT.STEP_STARTED, {
      step,
      current: this.currentIndex + 1,
      total: this.steps.length,
    })
  }

  scheduleNextStep() {
    this.disposeTimer()
    if (this.status !== RUN_STATUS.RUNNING) return
    this.timer = setTimeout(() => this.advance(), this.stepDelay)
  }

  advance() {
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
        result: {
          summary: '模拟任务已完成',
          completedSteps: this.steps.length,
        },
      })
      this.disposeTimer()
      return
    }

    this.currentIndex += 1
    this.emitCurrentStep()
    this.scheduleNextStep()
  }

  pause() {
    if (this.status !== RUN_STATUS.RUNNING) return
    this.status = RUN_STATUS.PAUSED
    this.disposeTimer()
    this.emit(AUTOMATION_EVENT.RUN_PAUSED)
  }

  resume() {
    if (this.status !== RUN_STATUS.PAUSED) return
    this.status = RUN_STATUS.RUNNING
    this.emit(AUTOMATION_EVENT.RUN_RESUMED)
    this.scheduleNextStep()
  }

  cancel() {
    if ([RUN_STATUS.IDLE, RUN_STATUS.COMPLETED, RUN_STATUS.CANCELLED].includes(this.status)) return
    this.status = RUN_STATUS.CANCELLED
    this.disposeTimer()
    this.emit(AUTOMATION_EVENT.RUN_CANCELLED)
  }

  disposeTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  dispose() {
    this.disposeTimer()
    this.listeners.clear()
  }
}
