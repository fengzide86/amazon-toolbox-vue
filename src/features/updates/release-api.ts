import { z } from 'zod'

import { api, request } from '@/utils/api'

const stagedFileSchema = z.object({
  name: z.string(),
  size: z.number().nonnegative(),
  sha512: z.string(),
})

const releaseSchema = z.object({
  version: z.string(),
  status: z.enum(['staged', 'published']),
  files: z.array(stagedFileSchema),
  manifest: z.record(z.string(), z.unknown()).optional(),
})

export type UpdateRelease = z.infer<typeof releaseSchema>

const releaseNoteSchema = z.object({
  title: z.string(),
  content: z.string(),
  app_version: z.string().nullable().optional(),
})

export async function listUpdateReleases(): Promise<UpdateRelease[]> {
  return z.array(releaseSchema).parse(await api.get('/api/updates/releases', {}, { cache: false }))
}

export async function stageUpdateRelease(version: string, files: File[]): Promise<UpdateRelease> {
  const form = new FormData()
  form.append('version', version)
  for (const file of files) form.append('files', file, file.name)
  const response = await request('/api/updates/releases/stage', { method: 'POST', body: form })
  return releaseSchema.parse(response?.data ?? response)
}

export async function publishUpdateRelease(version: string): Promise<UpdateRelease> {
  const response = await api.post(`/api/updates/releases/${encodeURIComponent(version)}/publish`)
  return releaseSchema.parse(response?.data ?? response)
}

export async function removeStagedUpdateRelease(version: string): Promise<void> {
  await api.delete(`/api/updates/releases/${encodeURIComponent(version)}/staged`)
}

export async function getVersionReleaseNotes(version: string): Promise<string[]> {
  const notes = z.array(releaseNoteSchema).parse(
    await api.get(`/api/announcements/release-notes/${encodeURIComponent(version)}`, {}, { cache: false }),
  )
  return notes.flatMap(note => note.content.split(/\r?\n/).map(line => line.trim()).filter(Boolean))
}
