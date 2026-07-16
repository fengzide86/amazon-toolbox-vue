import { z } from 'zod'

export const deviceSchema = z.object({
  id: z.union([z.string(), z.number()]),
  device_id: z.string(),
  device_name: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
}).passthrough()
export const deviceListSchema = z.array(deviceSchema)
export type DeviceSummary = z.infer<typeof deviceSchema>

export const executionRecordSchema = z.object({
  id: z.union([z.string(), z.number()]),
  status: z.string().default('cancelled'),
  tool_name: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  detail: z.string().nullable().optional(),
  error_code: z.string().nullable().optional(),
}).passthrough()
export const executionRecordListSchema = z.array(executionRecordSchema)
export type ExecutionRecord = z.infer<typeof executionRecordSchema>

export const customerPlanSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  status: z.string().default('active'),
  price: z.union([z.string(), z.number()]).default(0),
  duration_days: z.number().default(0),
  duration_label: z.string().nullable().optional(),
  plan_code: z.string().nullable().optional(),
  display_badge: z.string().nullable().optional(),
  is_recommended: z.boolean().optional(),
  benefits: z.array(z.string()).optional(),
  features: z.string().nullable().optional(),
}).passthrough()
export const customerPlanListSchema = z.array(customerPlanSchema)
export type CustomerPlan = z.infer<typeof customerPlanSchema>

export const storedLicenseSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  user_id: z.union([z.string(), z.number()]).optional(),
  max_devices: z.number().optional(),
  plan_name: z.string().optional(),
  plan_code: z.string().optional(),
}).passthrough()

export function readStoredLicense() {
  try {
    return storedLicenseSchema.parse(JSON.parse(localStorage.getItem('toolbox_user') || '{}'))
  } catch {
    return storedLicenseSchema.parse({})
  }
}
