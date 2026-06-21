// 设备相关 API
import { api, request } from './index.js';

// 获取设备列表（管理员）
export function getDevices(authCodeId = null) {
    return api.get('/api/devices', authCodeId ? { auth_code_id: authCodeId } : {});
}

// 获取我的设备列表
export function getMyDevices(userId) {
    return api.get('/api/devices/my', { user_id: userId });
}

// 解绑设备（管理员）
export function unbindDevice(deviceId) {
    return request(`/api/devices/unbind?device_id=${deviceId}`, { method: 'POST' });
}

// 用户解绑设备
export function userUnbindDevice(deviceId, userId) {
    return request(`/api/devices/user-unbind?device_id=${deviceId}&user_id=${userId}`, { method: 'POST' });
}
