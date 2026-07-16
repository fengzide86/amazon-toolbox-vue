import { z } from 'zod'

export const authRoleSchema = z.enum(['user', 'admin'])
export type AuthRole = z.infer<typeof authRoleSchema>

export const entitlementValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  z.null(),
])

export const entitlementsSchema = z.record(z.string(), entitlementValueSchema)
export type Entitlements = z.infer<typeof entitlementsSchema>

export const authenticatedUserSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  auth_code_id: z.union([z.string(), z.number()]).optional(),
  product_type: z.enum(['consumer', 'business']).optional(),
  business_workspace_enabled: z.boolean().optional(),
  entitlements: entitlementsSchema.optional(),
  platform_scope: z.union([z.string(), z.array(z.string())]).optional(),
}).passthrough()

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>

export const authSessionSchema = z.object({
  auth_code: z.string().optional(),
  token: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_at: z.string().optional(),
  role: authRoleSchema.optional(),
}).passthrough()

export type AuthSession = z.infer<typeof authSessionSchema>

export interface LoginPayload {
  token: string
  role: AuthRole
  auth_code?: string
  auth?: string
  user?: AuthenticatedUser | null
}

export const publicSettingsSchema = z.array(z.object({
  key: z.string(),
  value: z.string().nullable().optional(),
}).passthrough())

export const licenseLoginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().default('登录失败'),
  data: authenticatedUserSchema.extend({
    token: z.string(),
    user_id: z.union([z.string(), z.number()]).optional(),
    code: z.string().optional(),
    plan_name: z.string().optional(),
    plan_code: z.string().nullable().optional(),
    platform_scope: z.array(z.string()).optional(),
    product_type: z.enum(['consumer', 'business']).default('consumer'),
    business_workspace_enabled: z.boolean().default(false),
    entitlements: entitlementsSchema.default({}),
  }).passthrough().optional(),
}).passthrough()

export function parseStoredUser(raw: string | null): AuthenticatedUser | null {
  if (!raw) return null
  try {
    const result = authenticatedUserSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function parseAuthSession(raw: string | null): AuthSession | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = authSessionSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    // 旧版本曾直接保存授权码，继续允许读取，但仍要求重新取得服务端 token。
    return { auth_code: raw }
  }
}

export function hasBusinessWorkspaceAccess(user: AuthenticatedUser | null): boolean {
  return user?.product_type === 'business'
    && user.business_workspace_enabled === true
    && user.entitlements?.batch_execution === true
    && user.entitlements?.multi_account_workspace === true
}
