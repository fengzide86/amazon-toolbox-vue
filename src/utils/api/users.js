// 用户管理相关 API
import { api } from './index.js';

// 获取用户列表
export function getUsers() {
    return api.get('/api/users');
}

// 更新用户
export function updateUser(id, data) {
    return api.put(`/api/users/${id}`, data);
}