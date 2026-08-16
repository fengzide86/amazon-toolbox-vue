import { api, type ApiQueryParams } from './index'
import { normalizePaginatedResponse } from '@/shared/api/pagination'
import type { components } from '@/shared/api/openapi.generated'

type EntityId = string | number
type Schemas = components['schemas']
type ChatHistoryPage = Pick<Schemas['ChatHistoryResponse'], 'items' | 'total' | 'page' | 'page_size'>
type AdminChatSessionsPage = Pick<Schemas['AdminChatSessionsResponse'], 'items' | 'total' | 'page' | 'page_size'>

export const createChatSession = (data: Schemas['CreateSessionRequest'] = {}): Promise<Schemas['ChatSessionCreatedResponse']> =>
  api.post('/api/ai-chat/session', data)
export const getChatSession = (sessionId: EntityId): Promise<Schemas['ChatSessionDetailResponse']> =>
  api.get(`/api/ai-chat/session/${sessionId}`)
export const sendChatMessage = (
  sessionId: EntityId,
  message: string,
  context: Omit<Schemas['SendMessageRequest'], 'message'> = {},
): Promise<Schemas['ChatReplyResponse']> =>
  api.post(`/api/ai-chat/session/${sessionId}/message`, { message, ...context })
export const resolveChatSession = (
  sessionId: EntityId,
  satisfaction: Schemas['ResolveSessionRequest']['satisfaction'] = null,
): Promise<Schemas['ChatActionResponse']> => api.post(`/api/ai-chat/session/${sessionId}/resolve`, { satisfaction })
export const transferChatToHuman = (sessionId: EntityId): Promise<Schemas['ChatTransferResponse']> =>
  api.post(`/api/ai-chat/session/${sessionId}/transfer`)
export const rateChatSession = (
  sessionId: EntityId,
  satisfaction: Schemas['RateSessionRequest']['satisfaction'],
): Promise<Schemas['ChatActionResponse']> => api.post(`/api/ai-chat/session/${sessionId}/rate`, { satisfaction })
export const getChatHistory = async (page = 1, pageSize = 10): Promise<ChatHistoryPage> =>
  normalizePaginatedResponse<Schemas['ChatHistoryItemResponse']>(
    await api.get<Schemas['ChatHistoryResponse']>('/api/ai-chat/history', { page, page_size: pageSize }, { responseMode: 'raw' }),
  )
export const getAIChatConfig = (): Promise<Schemas['ChatConfigResponse']> => api.get('/api/ai-chat/admin/config')
export const updateAIChatConfig = (data: Schemas['UpdateChatConfigRequest']): Promise<Schemas['ChatConfigResponse']> =>
  api.put('/api/ai-chat/admin/config', data)
export const getAdminChatSessions = async (params: ApiQueryParams = {}): Promise<AdminChatSessionsPage> =>
  normalizePaginatedResponse<Schemas['AdminChatSessionItemResponse']>(
    await api.get<Schemas['AdminChatSessionsResponse']>('/api/ai-chat/admin/sessions', params, { responseMode: 'raw' }),
  )
export const getAdminChatSession = (sessionId: EntityId): Promise<Schemas['ChatSessionDetailResponse']> =>
  api.get(`/api/ai-chat/admin/sessions/${sessionId}`)
export const getAIChatStats = (): Promise<Schemas['AdminChatStatsResponse']> => api.get('/api/ai-chat/admin/stats')
export const debugAIChat = (data: Schemas['DebugChatRequest']): Promise<Schemas['DebugChatResponse']> =>
  api.post('/api/ai-chat/admin/debug', data)
