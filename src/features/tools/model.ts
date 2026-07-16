import { z } from 'zod'

export const toolCatalogItemSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  description: z.string().default(''),
  module: z.string().optional(),
  category: z.string().default('automation'),
  platform_key: z.string().optional(),
  capability_key: z.string().optional(),
  capability_tags: z.union([z.array(z.string()), z.string()]).optional(),
  preparation_notes: z.union([z.array(z.string()), z.string()]).optional(),
  intervention_scenarios: z.union([z.array(z.string()), z.string()]).optional(),
  available_plans: z.array(z.union([z.string(), z.number()])).optional(),
  release_status: z.string().optional(),
  status: z.string().optional(),
}).passthrough()

export const toolCatalogSchema = z.array(toolCatalogItemSchema)
export type ToolCatalogItem = z.infer<typeof toolCatalogItemSchema>

export const toolLaunchGrantSchema = z.object({
  token: z.string(),
  target_url: z.string(),
  tool_id: z.union([z.string(), z.number()]).optional(),
  tool_name: z.string().optional(),
  tool_module: z.string().optional(),
  category: z.string().optional(),
  platform_key: z.string().optional(),
  expires_at: z.string().optional(),
  script_key: z.string().optional(),
  runner_api_version: z.coerce.number().optional(),
  tool_version: z.string().optional(),
  tool_manifest: z.unknown().optional(),
  tool_signature: z.string().optional(),
  signing_key_id: z.string().optional(),
  signature_required: z.boolean().optional(),
}).passthrough()

export const toolLaunchResponseSchema = z.object({
  launch_data: toolLaunchGrantSchema.optional(),
  grant: toolLaunchGrantSchema.optional(),
  expires_at: z.string().optional(),
  expires_in: z.coerce.number().optional(),
}).passthrough()

export function errorCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null
  return typeof error.code === 'number' ? error.code : null
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
