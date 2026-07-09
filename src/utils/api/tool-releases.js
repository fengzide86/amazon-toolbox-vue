import { api } from './index.js'

export function getToolReleases() {
  return api.get('/api/tool-releases', {}, { cache: false })
}

export function createToolRelease(data) {
  return api.post('/api/tool-releases', data).then(response => response?.data ?? response)
}

export function publishToolRelease(toolId, version, data) {
  return api.post(`/api/tool-releases/${encodeURIComponent(toolId)}/${encodeURIComponent(version)}/publish`, data)
    .then(response => response?.data ?? response)
}

export function rollbackToolRelease(toolId, targetVersion) {
  return api.post(`/api/tool-releases/${encodeURIComponent(toolId)}/rollback`, { target_version: targetVersion })
    .then(response => response?.data ?? response)
}
