// 知识库相关 API
import { api } from './index.js';

export function getKnowledgeList(params = {}) {
    return api.get('/api/knowledge', params);
}

export function getKnowledgeCategories() {
    return api.get('/api/knowledge/categories');
}

export function getKnowledgeStats() {
    return api.get('/api/knowledge/stats');
}

export function getKnowledge(id) {
    return api.get(`/api/knowledge/${id}`);
}

export function createKnowledge(data) {
    return api.post('/api/knowledge', data);
}

export function updateKnowledge(id, data) {
    return api.put(`/api/knowledge/${id}`, data);
}

export function deleteKnowledge(id) {
    return api.delete(`/api/knowledge/${id}`);
}

export function batchImportKnowledge(items) {
    return api.post('/api/knowledge/batch-import', items);
}

export function syncKnowledgeVector() {
    return api.post('/api/knowledge/sync-vector');
}
