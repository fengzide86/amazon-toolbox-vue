import { api } from './index'

function unwrapData(response: unknown): unknown {
  if (typeof response !== 'object' || response === null || !('data' in response)) return response
  return (response as { data: unknown }).data
}

export const getFreightRateReleases = (): Promise<unknown> => api.get('/api/freight-rate-packs', {}, { cache: false })
export const createFreightRateDraft = async (data: unknown): Promise<unknown> => unwrapData(await api.post('/api/freight-rate-packs/drafts', data))
export const publishFreightRatePack = async (packId: string, version: string): Promise<unknown> =>
  unwrapData(await api.post(`/api/freight-rate-packs/${encodeURIComponent(packId)}/${encodeURIComponent(version)}/publish`, {}))
export const rollbackFreightRatePack = async (packId: string, targetVersion: string): Promise<unknown> =>
  unwrapData(await api.post(`/api/freight-rate-packs/${encodeURIComponent(packId)}/rollback`, { target_version: targetVersion }))
export const getCurrentFreightRatePack = (): Promise<unknown> => api.get('/api/freight-rate-packs/current', {}, { cache: false })
