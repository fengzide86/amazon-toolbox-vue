import { z } from 'zod'

const nullableText = z.string().nullable().optional()

export const knowledgeReferenceSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  title: z.string().optional(),
  category: z.string().optional(),
  content: z.string().optional(),
  score: z.coerce.number().default(0),
}).passthrough()

export const chatMessageSchema = z.object({
  id: z.number().optional(),
  role: z.string(),
  content: z.string(),
  knowledge_refs: z.array(knowledgeReferenceSchema).optional(),
  knowledge_ids: z.array(z.string()).optional(),
  created_at: nullableText,
}).passthrough()
export type ChatMessage = z.infer<typeof chatMessageSchema>

export const chatSessionCreatedSchema = z.object({
  session_id: z.string(),
  status: z.string().default('active'),
  welcome_message: z.string().optional(),
  suggested_questions: z.array(z.string()).optional(),
}).passthrough()

export const chatReplySchema = z.object({
  session_id: z.string(),
  reply: z.string(),
  knowledge_refs: z.array(knowledgeReferenceSchema).default([]),
})

export const chatSessionSummarySchema = z.object({
  session_id: z.string(),
  status: z.string(),
  message_count: z.coerce.number().int().nonnegative().default(0),
  ai_resolved: z.boolean().optional(),
  satisfaction: z.coerce.number().nullable().optional(),
  created_at: nullableText,
  user_id: z.union([z.string(), z.number()]).nullable().optional(),
  user_name: z.string().optional(),
  transferred_to_human: z.boolean().optional(),
  resolved_at: nullableText,
}).passthrough()
export type ChatSessionSummary = z.infer<typeof chatSessionSummarySchema>

export const chatHistorySchema = z.object({
  items: z.array(chatSessionSummarySchema).default([]),
  total: z.coerce.number().int().nonnegative().default(0),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().default(20),
})

export const chatSessionDetailSchema = chatSessionSummarySchema.extend({
  messages: z.array(chatMessageSchema).default([]),
})
export type ChatSessionDetail = z.infer<typeof chatSessionDetailSchema>

export const aiConfigSchema = z.object({
  welcome_message: z.string().default(''),
  suggested_questions: z.string().default('[]'),
  transfer_rules: z.string().default('{}'),
  ai_model: z.string().default('qwen-turbo'),
  reply_style: z.string().default('concise'),
}).passthrough()
export type AiConfig = z.infer<typeof aiConfigSchema>

export const aiStatsSchema = z.object({
  total_sessions: z.coerce.number().int().nonnegative().default(0),
  today_sessions: z.coerce.number().int().nonnegative().default(0),
  resolve_rate: z.coerce.number().default(0),
  transfer_rate: z.coerce.number().default(0),
  resolved: z.coerce.number().int().nonnegative().default(0),
  transferred: z.coerce.number().int().nonnegative().default(0),
  avg_satisfaction: z.coerce.number().nullable().optional(),
})

export const aiDebugResultSchema = z.object({
  reply: z.string(),
  answer_mode: z.string(),
  ai_used: z.boolean(),
  knowledge_refs: z.array(knowledgeReferenceSchema).default([]),
  fallback_reason: nullableText,
  diagnostics: z.object({
    retrieval_ms: z.coerce.number().optional(),
    generation_ms: z.coerce.number().optional(),
    total_ms: z.coerce.number().optional(),
    provider: nullableText,
    model: nullableText,
  }).passthrough().default({}),
}).passthrough()
export type AiDebugResult = z.infer<typeof aiDebugResultSchema>

export interface SandboxMessage {
  role: 'user' | 'ai'
  content: string
  time: string
  refs?: z.infer<typeof knowledgeReferenceSchema>[]
}

export function parseJsonRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
