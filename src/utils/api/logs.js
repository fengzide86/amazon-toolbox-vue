// 日志相关 API
import { api, API_BASE } from './index.js';
import { authService } from '../auth.js';

export function getLogs(userIdOrParams = {}) {
    const params = typeof userIdOrParams === 'number' 
        ? { user_id: userIdOrParams } 
        : userIdOrParams;
    return api.get('/api/logs', params);
}

export function exportLogs(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `${API_BASE}/api/logs/export${queryString ? '?' + queryString : ''}`;
    const token = authService.getAuth()?.token || localStorage.getItem('toolbox_token');
    return fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => res.blob());
}

export function getLogTools(userId = null) {
    return api.get('/api/logs/tools', userId ? { user_id: userId } : {});
}

export function createLog(data) {
    return api.post('/api/logs', data);
}
