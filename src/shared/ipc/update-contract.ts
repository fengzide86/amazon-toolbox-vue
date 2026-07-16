import { z } from 'zod'

export const updateStatusSchema = z.enum([
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'restart_deferred',
  'installing',
  'cancelled',
  'error',
])

export const updateSnapshotSchema = z.object({
  status: updateStatusSchema,
  currentVersion: z.string().min(1),
  availableVersion: z.string().min(1).optional(),
  releaseDate: z.string().optional(),
  releaseNotes: z.array(z.string()).default([]),
  downloadBytes: z.number().nonnegative().optional(),
  percent: z.number().min(0).max(100).optional(),
  transferredBytes: z.number().nonnegative().optional(),
  totalBytes: z.number().nonnegative().optional(),
  promptSuppressedUntil: z.string().optional(),
  errorCode: z.string().optional(),
  canRestart: z.boolean(),
})

export type UpdateStatus = z.infer<typeof updateStatusSchema>
export type UpdateSnapshot = z.infer<typeof updateSnapshotSchema>
export type UpdateDeferPhase = 'download' | 'install'

export const UPDATE_CHANNELS = {
  getState: 'updates:get-state',
  check: 'updates:check',
  startDownload: 'updates:start-download',
  cancelDownload: 'updates:cancel-download',
  install: 'updates:install',
  defer: 'updates:defer',
  state: 'updates:state',
} as const
