import { z } from 'zod'

export const businessToolSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  platform_key: z.string().optional(),
  platformKey: z.string().optional(),
  target_url: z.string().optional(),
  targetUrl: z.string().optional(),
  batch_input_schema: z.array(z.record(z.string(), z.unknown())).optional(),
  availability: z.enum(['demo_only', 'live_beta', 'live']).default('demo_only'),
  demo_scenario_id: z.string().default('default'),
  supports_demo_batch: z.boolean().default(true),
  supports_live_batch: z.boolean().default(false),
}).passthrough()
export type BusinessTool = z.infer<typeof businessToolSchema>

export const businessEntitlementsSchema = z.object({
  max_batch_rows: z.number().positive().optional(),
  max_open_sessions: z.number().positive().optional(),
}).passthrough()
export type BusinessEntitlements = z.infer<typeof businessEntitlementsSchema>

export const businessBootstrapSchema = z.object({
  entitlements: businessEntitlementsSchema.default({}),
  tools: z.array(businessToolSchema).default([]),
}).passthrough()
export type BusinessBootstrap = z.infer<typeof businessBootstrapSchema>

export const importPreviewSchema = z.object({
  importId: z.string(),
  fileName: z.string().optional(),
  validCount: z.number().nonnegative(),
  errorCount: z.number().nonnegative().optional(),
  worksheetName: z.string().optional(),
  templateVersion: z.string().nullable().optional(),
  rows: z.array(z.object({
    itemId: z.string(),
    preview: z.record(z.string(), z.unknown()),
  }).passthrough()).default([]),
  errors: z.array(z.object({
    rowNumber: z.number().optional(),
    message: z.string(),
  }).passthrough()).default([]),
}).passthrough()
export type ImportPreview = z.infer<typeof importPreviewSchema>

export const batchItemSchema = z.object({
  itemId: z.string(),
  accountLabelMasked: z.string().optional(),
  status: z.string(),
  interventionType: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  browserReady: z.boolean().default(false),
  progressPercent: z.number().min(0).max(100).optional(),
  stageIndex: z.number().int().min(0).max(4).optional(),
  startedAtMs: z.number().nonnegative().optional(),
  finishedAtMs: z.number().nonnegative().optional(),
  simulatedOutcome: z.enum(['completed_example', 'attention_example', 'failure_example']).nullable().optional(),
}).passthrough()
export type BatchItem = z.infer<typeof batchItemSchema>

export const batchCountsSchema = z.object({
  total: z.number().nonnegative().optional(),
  pending: z.number().nonnegative().optional(),
  running: z.number().nonnegative().optional(),
  waiting: z.number().nonnegative().optional(),
  completed: z.number().nonnegative().optional(),
  failed: z.number().nonnegative().optional(),
}).passthrough()

export const businessBatchSnapshotSchema = z.object({
  batchId: z.string().optional(),
  serverBatchId: z.union([z.string(), z.number()]).optional(),
  tool: businessToolSchema.optional(),
  status: z.string().default('idle'),
  activeItemId: z.string().nullable().optional(),
  provisioningItemId: z.string().nullable().optional(),
  maxOpenSessions: z.number().optional(),
  recordKind: z.enum(['demo', 'live']).default('live'),
  counts: batchCountsSchema.default({}),
  items: z.array(batchItemSchema).default([]),
}).passthrough()
export type BusinessBatchSnapshot = z.infer<typeof businessBatchSnapshotSchema>

export const batchEventSchema = z.object({
  type: z.string(),
  timestamp: z.number().optional(),
  itemId: z.string().optional(),
  snapshot: businessBatchSnapshotSchema.optional(),
}).passthrough()
export type BatchEvent = z.infer<typeof batchEventSchema>

export const serverBatchSchema = z.object({
  id: z.union([z.string(), z.number()]),
}).passthrough()

export const serverBatchHistorySchema = z.object({
  id: z.union([z.string(), z.number()]),
  tool_name: z.string().default('批量工具'),
  status: z.string().default('running'),
  total_count: z.number().nonnegative().default(0),
  waiting_count: z.number().nonnegative().default(0),
  completed_count: z.number().nonnegative().default(0),
  failed_count: z.number().nonnegative().default(0),
  started_at: z.string().nullable().optional(),
}).passthrough()
export type ServerBatchHistory = z.infer<typeof serverBatchHistorySchema>

export const launchGrantSchema = z.object({
  token: z.string(),
  platform_key: z.string().optional(),
  target_url: z.string().optional(),
  expires_at: z.string().optional(),
  script_key: z.string().optional(),
  runner_api_version: z.number().optional(),
  tool_version: z.string().optional(),
  tool_manifest: z.unknown().optional(),
  tool_signature: z.string().optional(),
  signing_key_id: z.string().optional(),
  signature_required: z.boolean().optional(),
}).passthrough()

export const launchGrantEnvelopeSchema = z.object({
  launch_data: launchGrantSchema.optional(),
  grant: launchGrantSchema.optional(),
  token: z.string().optional(),
  expires_at: z.string().optional(),
  expires_in: z.number().optional(),
}).passthrough()

export function emptyBatchSnapshot(): BusinessBatchSnapshot {
  return { status: 'idle', recordKind: 'demo', items: [], counts: {} }
}
