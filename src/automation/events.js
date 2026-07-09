export const RUN_STATUS = Object.freeze({
  IDLE: 'idle',
  PREPARING: 'preparing',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
})

export const AUTOMATION_EVENT = Object.freeze({
  RUN_STARTED: 'run.started',
  BROWSER_NAVIGATED: 'browser.navigated',
  STEP_STARTED: 'step.started',
  STEP_COMPLETED: 'step.completed',
  STEP_RETRYING: 'step.retrying',
  RUN_PAUSED: 'run.paused',
  RUN_RESUMED: 'run.resumed',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_CANCELLED: 'run.cancelled',
  ARTIFACT_CREATED: 'artifact.created',
})

let eventSequence = 0

export function createAutomationEvent(type, payload = {}) {
  eventSequence += 1
  return {
    protocolVersion: 1,
    eventId: `evt_${Date.now()}_${eventSequence}`,
    type,
    timestamp: Date.now(),
    ...payload,
  }
}

export function isTerminalStatus(status) {
  return [RUN_STATUS.COMPLETED, RUN_STATUS.FAILED, RUN_STATUS.CANCELLED].includes(status)
}
