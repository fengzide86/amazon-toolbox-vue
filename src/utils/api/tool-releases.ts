import { api } from './index'
import type { components } from '@/shared/api/openapi.generated'

type EntityId = string | number
type Schemas = components['schemas']
type JsonValue = Schemas['JsonValue']
type ToolRelease = Schemas['ToolReleaseResponse']
type ToolReleaseEnvelope = Schemas['ToolReleaseEnvelope']

export interface ToolReleaseCreatePayload {
  tool_id: string
  version: string
  script_key: string
  runner_api_version?: number
  adapter?: Record<string, JsonValue> | null
  [key: string]: JsonValue
}

export interface ToolReleasePublishPayload {
  channel?: 'stable' | 'canary'
  rollout_percentage?: number
}

export const getToolReleases = (): Promise<ToolRelease[]> =>
  api.get('/api/tool-releases', {}, { cache: false })

export const createToolRelease = async (data: ToolReleaseCreatePayload): Promise<ToolRelease> => {
  const response = await api.post<ToolReleaseEnvelope>('/api/tool-releases', data)
  return response.data
}

export const publishToolRelease = async (
  toolId: EntityId,
  version: string,
  data: ToolReleasePublishPayload,
): Promise<ToolRelease> => {
  const response = await api.post<ToolReleaseEnvelope>(
    `/api/tool-releases/${encodeURIComponent(toolId)}/${encodeURIComponent(version)}/publish`,
    data,
  )
  return response.data
}

export const rollbackToolRelease = async (toolId: EntityId, targetVersion: string): Promise<ToolRelease> => {
  const response = await api.post<ToolReleaseEnvelope>(
    `/api/tool-releases/${encodeURIComponent(toolId)}/rollback`,
    { target_version: targetVersion },
  )
  return response.data
}
