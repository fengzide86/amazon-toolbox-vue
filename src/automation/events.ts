import { z } from 'zod'

export const RUN_STATUS = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  RUNNING: 'running',
  WAITING_USER: 'waiting_user',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const

export type RunStatus = typeof RUN_STATUS[keyof typeof RUN_STATUS]

export const AUTOMATION_EVENT = {
  RUN_STARTED: 'run.started',
  BROWSER_NAVIGATED: 'browser.navigated',
  STEP_STARTED: 'step.started',
  STEP_COMPLETED: 'step.completed',
  STEP_RETRYING: 'step.retrying',
  RUN_PAUSED: 'run.paused',
  RUN_RESUMED: 'run.resumed',
  USER_ACTION_REQUIRED: 'user.action_required',
  USER_ACTION_COMPLETED: 'user.action_completed',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_CANCELLED: 'run.cancelled',
  ARTIFACT_CREATED: 'artifact.created',
} as const

export type AutomationEventType = typeof AUTOMATION_EVENT[keyof typeof AUTOMATION_EVENT]

export const automationToolSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().optional(),
  platformKey: z.string().optional(),
  targetUrl: z.string().optional(),
}).passthrough()
export type AutomationTool = z.infer<typeof automationToolSchema>

export const automationStepSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  detail: z.string().optional(),
  action: z.string().optional(),
  status: z.string().optional(),
  startedAt: z.number().nullable().optional(),
  completedAt: z.number().nullable().optional(),
  retryCount: z.number().optional(),
}).passthrough()
export type AutomationStep = z.infer<typeof automationStepSchema>

export const userActionSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  instruction: z.string().optional(),
}).passthrough()
export type UserAction = z.infer<typeof userActionSchema>

export const automationErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
}).passthrough()
export type AutomationError = z.infer<typeof automationErrorSchema>

export const automationEventSchema = z.object({
  protocolVersion: z.number().optional(),
  eventId: z.string().optional(),
  type: z.string(),
  timestamp: z.number().optional(),
  runId: z.string().nullable().optional(),
  url: z.string().optional(),
  tool: automationToolSchema.optional(),
  steps: z.array(automationStepSchema).optional(),
  step: automationStepSchema.optional(),
  stepId: z.string().nullable().optional(),
  retryCount: z.number().optional(),
  message: z.string().optional(),
  action: userActionSchema.optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: automationErrorSchema.optional(),
  artifact: z.unknown().optional(),
}).passthrough()
export type AutomationEvent = z.infer<typeof automationEventSchema>

let eventSequence = 0

export function createAutomationEvent(
  type: AutomationEventType,
  payload: Record<string, unknown> = {},
): AutomationEvent {
  eventSequence += 1
  return automationEventSchema.parse({
    protocolVersion: 1,
    eventId: `evt_${Date.now()}_${eventSequence}`,
    type,
    timestamp: Date.now(),
    ...payload,
  })
}

export function isTerminalStatus(status: RunStatus): boolean {
  return status === RUN_STATUS.COMPLETED
    || status === RUN_STATUS.FAILED
    || status === RUN_STATUS.CANCELLED
}
