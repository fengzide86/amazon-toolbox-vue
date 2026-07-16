import { z } from 'zod'

export const entityIdSchema = z.union([z.string(), z.number()])

const nullableText = z.string().nullable().optional()

export const adminUserSchema = z.object({
  id: entityIdSchema,
  name: nullableText,
  phone: nullableText,
  auth_code_id: entityIdSchema.nullable().optional(),
  device_id: nullableText,
  device_name: nullableText,
  total_seats: z.coerce.number().int().min(1).default(1),
  extra_devices: z.coerce.number().int().min(0).default(0),
  created_at: nullableText,
}).passthrough()

export const adminUsersSchema = z.array(adminUserSchema.nullable()).transform((items) =>
  items.filter((item): item is z.infer<typeof adminUserSchema> => item !== null),
)

export type AdminUser = z.infer<typeof adminUserSchema>

export const feedbackStatusSchema = z.enum(['pending', 'processing', 'resolved'])

export const adminFeedbackSchema = z.object({
  id: entityIdSchema,
  user_id: entityIdSchema.nullable().optional(),
  title: nullableText,
  content: nullableText,
  screenshot: nullableText,
  screenshots: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  status: feedbackStatusSchema.catch('pending'),
  admin_reply: nullableText,
  created_at: nullableText,
}).passthrough()

export const adminFeedbacksSchema = z.array(adminFeedbackSchema)
export type AdminFeedback = z.infer<typeof adminFeedbackSchema>
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>

export const profitSummarySchema = z.object({
  total_tech: z.coerce.number().default(0),
  total_market: z.coerce.number().default(0),
  total_product: z.coerce.number().default(0),
  total_service: z.coerce.number().default(0),
  total_coordination: z.coerce.number().default(0),
  total_record: z.coerce.number().default(0),
  grand_total: z.coerce.number().default(0),
})

export const adminSettingsSchema = z.array(z.object({
  key: z.string(),
  value: z.string().nullable().optional(),
}).passthrough())

const actionSummarySchema = z.object({
  expiring_authorizations: z.coerce.number().int().nonnegative().default(0),
  device_anomalies: z.coerce.number().int().nonnegative().default(0),
  pending_tickets: z.coerce.number().int().nonnegative().default(0),
  waiting_interventions: z.coerce.number().int().nonnegative().default(0),
  stale_batches: z.coerce.number().int().nonnegative().default(0),
})

export const adminActionCenterSchema = z.object({
  summary: actionSummarySchema,
  expiring_authorizations: z.array(z.object({
    id: entityIdSchema,
    code_masked: z.string(),
    expires_at: nullableText,
  })).default([]),
  device_anomalies: z.array(z.object({
    auth_code_id: entityIdSchema,
    code_masked: z.string(),
    seat_used: z.coerce.number().int().nonnegative(),
    seat_limit: z.coerce.number().int().positive(),
    device_used: z.coerce.number().int().nonnegative(),
    device_limit: z.coerce.number().int().positive(),
  })).default([]),
  pending_tickets: z.array(z.object({
    id: entityIdSchema,
    title: z.string(),
    priority: z.string().nullable().optional(),
    created_at: nullableText,
  })).default([]),
  waiting_interventions: z.array(z.object({
    batch_id: entityIdSchema,
    tool_name: z.string(),
    account_label_masked: z.string(),
    intervention_type: z.string().nullable().optional(),
    updated_at: nullableText,
  })).default([]),
  stale_batches: z.array(z.object({
    batch_id: entityIdSchema,
    tool_name: z.string(),
    last_heartbeat_at: nullableText,
  })).default([]),
})

export type AdminActionCenter = z.infer<typeof adminActionCenterSchema>

export const adminBatchDetailSchema = z.object({
  id: entityIdSchema,
  tool_name: z.string(),
  status: z.string(),
  total_count: z.coerce.number().int().nonnegative(),
  last_heartbeat_at: nullableText,
  items: z.array(z.object({
    account_label_masked: z.string(),
    status: z.string(),
    intervention_type: z.string().nullable().optional(),
    customer_message: nullableText,
    updated_at: nullableText,
  })).default([]),
})

export type AdminBatchDetail = z.infer<typeof adminBatchDetailSchema>

export const adminPlanSchema = z.object({
  id: entityIdSchema,
  name: z.string(),
  price: z.coerce.number(),
  duration_days: z.coerce.number().int().nonnegative().optional(),
  status: z.string().default('active'),
}).passthrough()
export const adminPlansSchema = z.array(adminPlanSchema)
export type AdminPlan = z.infer<typeof adminPlanSchema>

export const adminOrderSchema = z.object({
  id: entityIdSchema,
  order_no: z.string(),
  plan_id: entityIdSchema.nullable().optional(),
  amount: z.coerce.number(),
  channel: nullableText,
  responsible: nullableText,
  status: z.string().default('pending'),
  refund_amount: z.coerce.number().default(0),
  created_at: nullableText,
}).passthrough()
export const adminOrdersSchema = z.array(adminOrderSchema)
export type AdminOrder = z.infer<typeof adminOrderSchema>

export const knowledgeItemSchema = z.object({
  id: entityIdSchema,
  category: z.string(),
  title: z.string(),
  content: z.string(),
  keywords: z.array(z.string()).default([]),
  priority: z.string().default('medium'),
  status: z.string().default('active'),
  vector_id: nullableText,
  view_count: z.coerce.number().int().nonnegative().default(0),
  platform_key: nullableText,
  capability_key: nullableText,
  created_at: nullableText,
  updated_at: nullableText,
}).passthrough()
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>

export const knowledgeListSchema = z.object({
  items: z.array(knowledgeItemSchema).default([]),
  total: z.coerce.number().int().nonnegative().default(0),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().default(20),
})

export const knowledgeCategoriesSchema = z.array(z.object({
  name: z.string(),
  count: z.coerce.number().int().nonnegative().default(0),
}))

export const knowledgeStatsSchema = z.object({
  total: z.coerce.number().int().nonnegative().default(0),
  active: z.coerce.number().int().nonnegative().default(0),
  categories: z.coerce.number().int().nonnegative().default(0),
  vector_store: z.object({
    total_vectors: z.coerce.number().int().nonnegative().default(0),
    status: z.string().default('unknown'),
  }).passthrough().default({ total_vectors: 0, status: 'unknown' }),
})

export const vectorSyncResultSchema = z.object({ synced: z.coerce.number().int().nonnegative() })

export const retrievalTestResultSchema = z.object({
  elapsed_ms: z.coerce.number().nonnegative(),
  results: z.array(z.object({
    id: entityIdSchema,
    title: z.string(),
    category: z.string(),
    content: z.string(),
    score: z.coerce.number(),
    platform_key: nullableText,
    capability_key: nullableText,
  }).passthrough()).default([]),
}).passthrough()

export type RetrievalTestResult = z.infer<typeof retrievalTestResultSchema>
