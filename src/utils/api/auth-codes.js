// 授权码相关 API
import { api } from './index.js';

export function getAuthCodes(params = {}) {
    return api.get('/api/auth-codes', params);
}

export function batchGenerateAuthCodes(data) {
    return api.post('/api/auth-codes/batch-generate', data);
}

export function updateAuthCode(id, data) {
    return api.put(`/api/auth-codes/\${id}`, data);
}

export function deleteAuthCode(id) {
    return api.delete(`/api/auth-codes/\${id}`);
}
