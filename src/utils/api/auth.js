// 认证相关 API
import { api } from './index.js';

// 授权验证
export function verifyAuthCode(code, deviceId, deviceName) {
    return api.post('/api/auth/verify', {
        code,
        device_id: deviceId,
        device_name: deviceName,
    });
}

// 管理员登录
export function adminLogin(password) {
    return api.post('/api/auth/admin-login', { password });
}

// 检查授权码状态（用于踢人）
export function checkAuthStatus(code, deviceId) {
    return api.post('/api/auth/check', {
        code,
        device_id: deviceId,
        device_name: ''
    });
}