import { z } from 'zod'

export const AUTOMATION_PROTOCOL_VERSION = 1 as const
export const AUTOMATION_PROTOCOL_ERROR_CODE = 'RUNNER_PROTOCOL_INVALID' as const

const unknownRecordSchema = z.record(z.string(), z.unknown())
const messageIdSchema = z.string().min(1).max(200)

export const runnerCommandNameSchema = z.enum([
  'start',
  'preflight',
  'pause',
  'resume',
  'complete-user-action',
  'cancel',
  'shutdown',
])

export const runnerCommandSchema = z.object({
  type: z.literal('command'),
  id: messageIdSchema,
  command: runnerCommandNameSchema,
  payload: unknownRecordSchema.default({}),
})

export const runnerEventSchema = z.object({
  protocolVersion: z.literal(AUTOMATION_PROTOCOL_VERSION),
  eventId: messageIdSchema,
  type: z.string().min(1),
}).catchall(z.unknown())

export const runnerEventEnvelopeSchema = z.object({
  type: z.literal('event'),
  event: runnerEventSchema,
})

export const hostRequestSchema = z.object({
  type: z.literal('host-request'),
  id: messageIdSchema,
  action: z.string().min(1),
  payload: unknownRecordSchema.default({}),
})

export const protocolErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
})

export const runnerResponseSchema = z.object({
  type: z.literal('response'),
  id: messageIdSchema,
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: protocolErrorSchema.optional(),
})

/**
 * Read-only browser/script readiness result.  This deliberately lives on the
 * runner protocol rather than in the page layer so a renderer cannot bypass
 * the same checks that protect `start`.
 */
export const runnerScriptStatusSchema = z.enum(['ready', 'not_ready', 'blocked'])
export const runnerBrowserModeSchema = z.enum(['embedded-cdp', 'playwright'])
export const runnerBrowserStateSchema = z.enum([
  'idle', 'registering', 'ready', 'navigating', 'inspected', 'running',
  'waiting_user', 'completed', 'closing', 'closed', 'error',
])
export const runnerPreflightResultSchema = z.object({
  browserMode: runnerBrowserModeSchema,
  // Default keeps a newer renderer compatible with a preflight response from
  // an older local runner while the protocol remains on version 1.
  browserState: runnerBrowserStateSchema.default('idle'),
  targetUrl: z.string(),
  pageTitle: z.string().optional(),
  pageFingerprint: z.string().optional(),
  scanReport: z.string().optional(),
  scriptKey: z.string(),
  scriptStatus: runnerScriptStatusSchema,
  canStart: z.boolean(),
  blockedCode: z.string().optional(),
  blockedMessage: z.string().optional(),
})

export const hostResponseSchema = z.object({
  type: z.literal('host-response'),
  id: messageIdSchema,
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: protocolErrorSchema.optional(),
})

export const runnerToHostMessageSchema = z.discriminatedUnion('type', [
  runnerEventEnvelopeSchema,
  hostRequestSchema,
  runnerResponseSchema,
])

export const hostToRunnerMessageSchema = z.discriminatedUnion('type', [
  runnerCommandSchema,
  hostResponseSchema,
])

export type RunnerCommandName = z.infer<typeof runnerCommandNameSchema>
export type RunnerCommand = z.infer<typeof runnerCommandSchema>
export type RunnerEvent = z.infer<typeof runnerEventSchema>
export type HostRequest = z.infer<typeof hostRequestSchema>
export type HostResponse = z.infer<typeof hostResponseSchema>
export type RunnerResponse = z.infer<typeof runnerResponseSchema>
export type RunnerScriptStatus = z.infer<typeof runnerScriptStatusSchema>
export type RunnerPreflightResult = z.infer<typeof runnerPreflightResultSchema>

export function runnerProtocolError(message = 'Runner protocol payload is invalid'): Error & { code: typeof AUTOMATION_PROTOCOL_ERROR_CODE } {
  return Object.assign(new Error(message), { code: AUTOMATION_PROTOCOL_ERROR_CODE })
}
