// 公告相关 API
import { api } from './index.js';

export function getAnnouncements(status) {
    const params = status ? { status } : {};
    return api.get('/api/announcements', params);
}

export function getActiveAnnouncements() {
    return api.get('/api/announcements/active');
}

export function createAnnouncement(data) {
    return api.post('/api/announcements', data);
}

export function updateAnnouncement(id, data) {
    return api.put(`/api/announcements/${id}`, data);
}

export function deleteAnnouncement(id) {
    return api.delete(`/api/announcements/${id}`);
}
