// 工单相关 API
import { api } from './index.js';

export function getFeedbacks(params = {}) {
    return api.get('/api/feedback', params);
}

export function getMyFeedbacks(params = {}) {
    return api.get('/api/feedback/my', params);
}

export function createFeedback(data) {
    return api.post('/api/feedback', data);
}

export function updateFeedback(id, data) {
    return api.put(`/api/feedback/${id}`, data);
}
