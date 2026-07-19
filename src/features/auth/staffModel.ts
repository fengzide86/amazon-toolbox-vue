import { z } from 'zod'
import { backofficeRoleSchema } from './model'

export const staffStatusSchema = z.enum(['active', 'disabled'])

export const staffAccountSchema = z.object({
  id: z.union([z.string(), z.number()]),
  username: z.string(),
  display_name: z.string(),
  role: backofficeRoleSchema,
  status: staffStatusSchema,
  force_password_reset: z.boolean().default(false),
  last_login_at: z.string().nullable().optional(),
  created_by_staff_id: z.union([z.string(), z.number()]).nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
}).passthrough()

export type StaffAccount = z.infer<typeof staffAccountSchema>

export const staffAccountListResponseSchema = z.object({
  success: z.boolean().default(true),
  message: z.string().default('ok'),
  data: z.array(staffAccountSchema).default([]),
  page: z.coerce.number().positive().default(1),
  page_size: z.coerce.number().positive().default(20),
  total: z.coerce.number().nonnegative().default(0),
}).passthrough()

export const staffAuthResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().default('操作失败'),
  data: z.object({
    token: z.string(),
    staff_id: z.union([z.string(), z.number()]),
    username: z.string(),
    name: z.string().optional(),
    display_name: z.string().optional(),
    role: backofficeRoleSchema,
    status: staffStatusSchema,
    force_password_reset: z.boolean().default(false),
  }).passthrough().optional(),
}).passthrough()
