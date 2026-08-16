import { api } from './index'
import type { components } from '@/shared/api/openapi.generated'

type Schemas = components['schemas']
type JsonValue = Schemas['JsonValue']
type FreightRateRelease = Schemas['FreightRateReleaseResponse']
type FreightRateReleaseEnvelope = Schemas['FreightRateReleaseEnvelope']

export interface FreightRateDraftPayload {
  pack: JsonValue
  source_file_name?: string | null
}

export const getFreightRateReleases = (): Promise<FreightRateRelease[]> =>
  api.get('/api/freight-rate-packs', {}, { cache: false })

export const createFreightRateDraft = async (data: FreightRateDraftPayload): Promise<FreightRateRelease> => {
  const response = await api.post<FreightRateReleaseEnvelope>('/api/freight-rate-packs/drafts', data)
  return response.data
}

export const publishFreightRatePack = async (packId: string, version: string): Promise<FreightRateRelease> => {
  const response = await api.post<FreightRateReleaseEnvelope>(
    `/api/freight-rate-packs/${encodeURIComponent(packId)}/${encodeURIComponent(version)}/publish`,
    {},
  )
  return response.data
}

export const rollbackFreightRatePack = async (packId: string, targetVersion: string): Promise<FreightRateRelease> => {
  const response = await api.post<FreightRateReleaseEnvelope>(
    `/api/freight-rate-packs/${encodeURIComponent(packId)}/rollback`,
    { target_version: targetVersion },
  )
  return response.data
}

export const getCurrentFreightRatePack = (): Promise<FreightRateRelease> =>
  api.get('/api/freight-rate-packs/current', {}, { cache: false })
