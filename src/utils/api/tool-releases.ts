import { api } from './index'

type EntityId = string | number

function unwrapData(response: unknown): unknown {
  if (typeof response !== 'object' || response === null || !('data' in response)) return response
  return (response as { data: unknown }).data
}

export const getToolReleases = (): Promise<unknown> => api.get('/api/tool-releases', {}, { cache: false })
export const createToolRelease = async (data: unknown): Promise<unknown> => unwrapData(await api.post('/api/tool-releases', data))
export const publishToolRelease = async (toolId: EntityId, version: string, data: unknown): Promise<unknown> =>
  unwrapData(await api.post(`/api/tool-releases/${encodeURIComponent(toolId)}/${encodeURIComponent(version)}/publish`, data))
export const rollbackToolRelease = async (toolId: EntityId, targetVersion: string): Promise<unknown> =>
  unwrapData(await api.post(`/api/tool-releases/${encodeURIComponent(toolId)}/rollback`, { target_version: targetVersion }))
