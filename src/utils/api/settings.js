// 设置相关 API
import { api } from './index.js';

export function getSettings() {
    return api.get('/api/settings');
}

export function updateSetting(data) {
    return api.put('/api/settings', data);
}

export function getPublicSettings() {
    return api.get('/api/settings/public');
}
