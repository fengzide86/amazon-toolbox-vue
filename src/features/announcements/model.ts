import { z } from 'zod'

export const announcementSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  content: z.string(),
  type: z.string(),
  audience: z.enum(['all', 'consumer', 'business']),
  category: z.enum(['system', 'update', 'activity', 'maintenance']),
  severity: z.enum(['info', 'important', 'critical']),
  presentation: z.enum(['banner', 'modal']),
  app_version: z.string().nullable().optional(),
  priority: z.number().int(),
  starts_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
  revision: z.number().int().positive(),
  created_at: z.string().nullable().optional(),
  is_read: z.boolean(),
  is_dismissed: z.boolean(),
})

export const announcementFeedSchema = z.array(announcementSchema)
export type Announcement = z.infer<typeof announcementSchema>
