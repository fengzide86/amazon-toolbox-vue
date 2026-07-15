import { computed, markRaw, ref } from 'vue'
import { defineStore } from 'pinia'
import { AUTOMATION_EVENT, RUN_STATUS, createAutomationAdapter, isTerminalStatus } from '@/automation'

export const useTaskRunStore = defineStore('taskRun', () => {
  const runId = ref(null)
  const tool = ref(null)
  const status = ref(RUN_STATUS.IDLE)
  const steps = ref([])
  const currentStepId = ref(null)
  const browserUrl = ref('')
  const elapsedSeconds = ref(0)
  const result = ref(null)
  const error = ref(null)
  const artifacts = ref([])
  const userAction = ref(null)

  let adapter = null
  let unsubscribe = null
  let clockTimer = null

  const completedCount = computed(() => steps.value.filter(step => step.status === 'done').length)
  const progressPercent = computed(() => steps.value.length
    ? Math.round((completedCount.value / steps.value.length) * 100)
    : 0)
  const currentStep = computed(() => steps.value.find(step => step.id === currentStepId.value) || steps.value.at(-1) || {})
  const formattedElapsed = computed(() => {
    const minutes = Math.floor(elapsedSeconds.value / 60).toString().padStart(2, '0')
    const seconds = (elapsedSeconds.value % 60).toString().padStart(2, '0')
    return `${minutes}:${seconds}`
  })
  const statusText = computed(() => ({
    [RUN_STATUS.IDLE]: '未开始',
    [RUN_STATUS.PREPARING]: '准备中',
    [RUN_STATUS.RUNNING]: '执行中',
    [RUN_STATUS.WAITING_USER]: '需要操作',
    [RUN_STATUS.PAUSED]: '已暂停',
    [RUN_STATUS.COMPLETED]: '已完成',
    [RUN_STATUS.FAILED]: '执行失败',
    [RUN_STATUS.CANCELLED]: '已取消',
  }[status.value] || status.value))

  function startClock() {
    stopClock()
    clockTimer = setInterval(() => {
      if (status.value === RUN_STATUS.RUNNING) elapsedSeconds.value += 1
    }, 1000)
  }

  function stopClock() {
    if (clockTimer) clearInterval(clockTimer)
    clockTimer = null
  }

  function updateStep(stepId, patch) {
    const index = steps.value.findIndex(step => step.id === stepId)
    if (index === -1) return
    steps.value[index] = { ...steps.value[index], ...patch }
  }

  function applyEvent(event) {
    if (!event?.type) return
    if (event.type !== AUTOMATION_EVENT.RUN_STARTED && runId.value && event.runId && event.runId !== runId.value) return

    switch (event.type) {
      case AUTOMATION_EVENT.RUN_STARTED:
        runId.value = event.runId
        tool.value = event.tool
        status.value = RUN_STATUS.RUNNING
        steps.value = (event.steps || []).map(step => ({ ...step, status: 'pending', startedAt: null, completedAt: null }))
        elapsedSeconds.value = 0
        result.value = null
        error.value = null
        artifacts.value = []
        userAction.value = null
        startClock()
        break
      case AUTOMATION_EVENT.BROWSER_NAVIGATED:
        browserUrl.value = event.url || ''
        break
      case AUTOMATION_EVENT.STEP_STARTED:
        currentStepId.value = event.step.id
        updateStep(event.step.id, { status: 'active', startedAt: event.timestamp })
        break
      case AUTOMATION_EVENT.STEP_COMPLETED:
        updateStep(event.stepId, { status: 'done', completedAt: event.timestamp })
        break
      case AUTOMATION_EVENT.STEP_RETRYING:
        updateStep(event.stepId, { status: 'active', retryCount: event.retryCount || 1 })
        break
      case AUTOMATION_EVENT.RUN_PAUSED:
        status.value = RUN_STATUS.PAUSED
        updateStep(currentStepId.value, { status: 'paused' })
        break
      case AUTOMATION_EVENT.RUN_RESUMED:
        status.value = RUN_STATUS.RUNNING
        updateStep(currentStepId.value, { status: 'active' })
        break
      case AUTOMATION_EVENT.USER_ACTION_REQUIRED:
        status.value = RUN_STATUS.WAITING_USER
        userAction.value = event.action || { title: '需要你完成一步', instruction: event.message || '' }
        updateStep(currentStepId.value, { status: 'paused' })
        break
      case AUTOMATION_EVENT.USER_ACTION_COMPLETED:
        status.value = RUN_STATUS.RUNNING
        userAction.value = null
        updateStep(currentStepId.value, { status: 'active' })
        break
      case AUTOMATION_EVENT.RUN_COMPLETED:
        status.value = RUN_STATUS.COMPLETED
        result.value = event.result || {}
        currentStepId.value = null
        stopClock()
        break
      case AUTOMATION_EVENT.RUN_FAILED:
        status.value = RUN_STATUS.FAILED
        error.value = event.error || { message: '任务执行失败' }
        updateStep(event.stepId || currentStepId.value, { status: 'failed' })
        stopClock()
        break
      case AUTOMATION_EVENT.RUN_CANCELLED:
        status.value = RUN_STATUS.CANCELLED
        updateStep(currentStepId.value, { status: 'cancelled' })
        stopClock()
        break
      case AUTOMATION_EVENT.ARTIFACT_CREATED:
        artifacts.value.push(event.artifact)
        break
    }
  }

  function disposeAdapter() {
    unsubscribe?.()
    unsubscribe = null
    adapter?.dispose?.()
    adapter = null
  }

  async function start(nextTool, options = {}) {
    disposeAdapter()
    stopClock()
    runId.value = null
    status.value = RUN_STATUS.PREPARING
    tool.value = { ...nextTool }
    browserUrl.value = nextTool.targetUrl || ''
    steps.value = []
    currentStepId.value = null
    elapsedSeconds.value = 0
    result.value = null
    error.value = null
    artifacts.value = []
    userAction.value = null
    adapter = markRaw(options.adapter || createAutomationAdapter(options))
    unsubscribe = adapter.subscribe(applyEvent)
    try {
      return await adapter.start(nextTool)
    } catch (startError) {
      status.value = RUN_STATUS.FAILED
      error.value = { code: startError?.code || 'RUNNER_START_FAILED', message: startError?.message || '自动处理启动失败' }
      stopClock()
      throw startError
    }
  }

  function pause() {
    adapter?.pause?.()
  }

  function resume() {
    adapter?.resume?.()
  }

  function cancel() {
    adapter?.cancel?.()
  }

  function completeUserAction() {
    return adapter?.completeUserAction?.()
  }

  function restart() {
    if (tool.value) return start(tool.value)
  }

  function reset() {
    if (!isTerminalStatus(status.value)) adapter?.cancel?.()
    disposeAdapter()
    stopClock()
    runId.value = null
    tool.value = null
    status.value = RUN_STATUS.IDLE
    steps.value = []
    currentStepId.value = null
    browserUrl.value = ''
    elapsedSeconds.value = 0
    result.value = null
    error.value = null
    artifacts.value = []
    userAction.value = null
  }

  return {
    runId,
    tool,
    status,
    steps,
    currentStepId,
    browserUrl,
    elapsedSeconds,
    result,
    error,
    artifacts,
    userAction,
    completedCount,
    progressPercent,
    currentStep,
    formattedElapsed,
    statusText,
    start,
    pause,
    resume,
    cancel,
    completeUserAction,
    restart,
    reset,
    applyEvent,
  }
})
