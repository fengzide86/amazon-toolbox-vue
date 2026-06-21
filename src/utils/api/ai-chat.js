// AI 客服相关 API
import { api } from './index.js';

export function createChatSession() {
    return api.post('/api/ai-chat/session');
}

export function getChatSession(sessionId) {
    return api.get(`/api/ai-chat/session/${sessionId}`);
}

export function sendChatMessage(sessionId, message) {
    return api.post(`/api/ai-chat/session/${sessionId}/message`, { message });
}

export function resolveChatSession(sessionId, satisfaction = null) {
    return api.post(`/api/ai-chat/session/${sessionId}/resolve`, { satisfaction });
}

export function transferChatToHuman(sessionId) {
    return api.post(`/api/ai-chat/session/${sessionId}/transfer`);
}

export function rateChatSession(sessionId, satisfaction) {
    return api.post(`/api/ai-chat/session/${sessionId}/rate`, { satisfaction });
}

export function getChatHistory(page = 1, pageSize = 10) {
    return api.get('/api/ai-chat/history', { page, page_size: pageSize });
}

export function getAIChatConfig() {
    return api.get('/api/ai-chat/admin/config');
}

export function updateAIChatConfig(data) {
    return api.put('/api/ai-chat/admin/config', data);
}

export function getAdminChatSessions(params = {}) {
    return api.get('/api/ai-chat/admin/sessions', params);
}

export function getAdminChatSession(sessionId) {
    return api.get(`/api/ai-chat/admin/sessions/${sessionId}`);
}

export function getAIChatStats() {
    return api.get('/api/ai-chat/admin/stats');
}
