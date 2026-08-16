import { z } from 'zod'

export const webVersionSchema = z.object({
  version: z.string().min(1),
  commit: z.string().nullable().optional(),
  commitSha: z.string().nullable().optional(),
  releaseId: z.string().nullable().optional(),
  builtAt: z.string().nullable().optional(),
})

export type WebVersion = z.infer<typeof webVersionSchema>

function numericVersion(value: string): number[] {
  const core = value.trim().replace(/^v/i, '').split('-', 1)[0] || ''
  const parts = core.split('.').map(part => Number(part))
  return parts.length > 0 && parts.every(Number.isInteger) ? parts : []
}

export function compareVersions(left: string, right: string): number {
  const a = numericVersion(left)
  const b = numericVersion(right)
  if (!a.length || !b.length) return left.localeCompare(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference) return difference
  }
  return 0
}

export async function fetchWebVersion(request: typeof fetch = fetch): Promise<WebVersion> {
  const url = new URL('/web-version.json', window.location.origin)
  url.searchParams.set('t', String(Date.now()))
  const response = await request(url.toString(), { cache: 'no-store' })
  if (!response.ok) throw new Error(`Web version request failed: ${response.status}`)
  return webVersionSchema.parse(await response.json())
}
