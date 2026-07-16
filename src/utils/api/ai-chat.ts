import { api, type ApiQueryParams } from './index'

type EntityId = string | number
type Payload = Record<string, unknown>

export const createChatSession = (data: Payload = {}): Promise<unknown> => api.post('/api/ai-chat/session', data)
export const getChatSession = (sessionId: EntityId): Promise<unknown> => api.get(`/api/ai-chat/session/${sessionId}`)
export const sendChatMessage = (sessionId: EntityId, message: string, context: Payload = {}): Promise<unknown> =>
  api.post(`/api/ai-chat/session/${sessionId}/message`, { message, ...context })
export const resolveChatSession = (sessionId: EntityId, satisfaction: number | null = null): Promise<unknown> =>
  api.post(`/api/ai-chat/session/${sessionId}/resolve`, { satisfaction })
export const transferChatToHuman = (sessionId: EntityId): Promise<unknown> => api.post(`/api/ai-chat/session/${sessionId}/transfer`)
export const rateChatSession = (sessionId: EntityId, satisfaction: number): Promise<unknown> => api.post(`/api/ai-chat/session/${sessionId}/rate`, { satisfaction })
export const getChatHistory = (page = 1, pageSize = 10): Promise<unknown> => api.get('/api/ai-chat/history', { page, page_size: pageSize })
export const getAIChatConfig = (): Promise<unknown> => api.get('/api/ai-chat/admin/config')
export const updateAIChatConfig = (data: Payload): Promise<unknown> => api.put('/api/ai-chat/admin/config', data)
export const getAdminChatSessions = (params: ApiQueryParams = {}): Promise<unknown> => api.get('/api/ai-chat/admin/sessions', params)
export const getAdminChatSession = (sessionId: EntityId): Promise<unknown> => api.get(`/api/ai-chat/admin/sessions/${sessionId}`)
export const getAIChatStats = (): Promise<unknown> => api.get('/api/ai-chat/admin/stats')
export const debugAIChat = (data: Payload): Promise<unknown> => api.post('/api/ai-chat/admin/debug', data)
