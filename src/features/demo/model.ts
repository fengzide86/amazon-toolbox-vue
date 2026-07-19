import { z } from 'zod'

const entityIdSchema = z.union([z.string(), z.number()])

export const demoRunStatusSchema = z.enum([
  'created',
  'running',
  'paused',
  'completed',
  'cancelled',
  'error',
])
export type DemoRunStatus = z.infer<typeof demoRunStatusSchema>
export const simulatedOutcomeSchema = z.enum([
  'completed_example',
  'attention_example',
  'failure_example',
])

export const demoRunSchema = z.object({
  id: entityIdSchema,
  record_kind: z.literal('demo').default('demo'),
  execution_scope: z.literal('single').default('single'),
  tool_id: entityIdSchema,
  tool_name_snapshot: z.string().default('工具演示'),
  platform_key: z.string().default('amazon'),
  scenario_id: z.string().default('default'),
  status: demoRunStatusSchema.default('created'),
  current_step_id: z.string().nullable().optional(),
  completed_step_count: z.coerce.number().nonnegative().default(0),
  total_step_count: z.coerce.number().nonnegative().default(0),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  error_code: z.string().nullable().optional(),
  simulated_outcome: simulatedOutcomeSchema.nullable().optional(),
}).passthrough()
export type DemoRun = z.infer<typeof demoRunSchema>
export const demoRunListSchema = z.array(demoRunSchema)

export const demoBatchStatusSchema = z.enum(['created', 'running', 'completed', 'cancelled', 'error'])
export type DemoBatchStatus = z.infer<typeof demoBatchStatusSchema>

export const demoBatchSchema = z.object({
  id: entityIdSchema,
  record_kind: z.literal('demo').default('demo'),
  execution_scope: z.literal('batch').default('batch'),
  tool_id: entityIdSchema,
  tool_name_snapshot: z.string().default('批量流程演示'),
  scenario_id: z.string().default('default'),
  status: demoBatchStatusSchema.default('created'),
  row_count: z.coerce.number().nonnegative().default(0),
  queued_count: z.coerce.number().nonnegative().default(0),
  playing_count: z.coerce.number().nonnegative().default(0),
  played_count: z.coerce.number().nonnegative().default(0),
  error_count: z.coerce.number().nonnegative().default(0),
  skipped_count: z.coerce.number().nonnegative().default(0),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  items: z.array(z.object({
    item_ref: z.string(),
    status: z.enum(['queued', 'playing', 'played', 'skipped', 'error']).default('queued'),
    simulated_outcome: simulatedOutcomeSchema.nullable().optional(),
    event_seq: z.coerce.number().nonnegative().default(0),
  }).passthrough()).optional(),
}).passthrough()
export type DemoBatch = z.infer<typeof demoBatchSchema>
export const demoBatchListSchema = z.array(demoBatchSchema)

export function unwrapApiData(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('data' in value)) return value
  return (value as { data: unknown }).data
}
