import { z } from 'zod'

export const AUTOMATION_PROTOCOL_VERSION = 1 as const
export const AUTOMATION_PROTOCOL_ERROR_CODE = 'RUNNER_PROTOCOL_INVALID' as const

const unknownRecordSchema = z.record(z.string(), z.unknown())
const messageIdSchema = z.string().min(1).max(200)

export const runnerCommandNameSchema = z.enum([
  'start',
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

export function runnerProtocolError(message = 'Runner protocol payload is invalid'): Error & { code: typeof AUTOMATION_PROTOCOL_ERROR_CODE } {
  return Object.assign(new Error(message), { code: AUTOMATION_PROTOCOL_ERROR_CODE })
}
