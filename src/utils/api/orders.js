// 订单相关 API
import { api, API_BASE } from './index.js';
import { authService } from '../auth.js';

// 获取订单列表（支持平台过滤）
export function getOrders(params = {}) {
    return api.get('/api/orders', params);
}

// 导出订单
export function exportOrders(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `${API_BASE}/api/orders/export${queryString ? '?' + queryString : ''}`;
    const token = authService.getAuth()?.token || localStorage.getItem('toolbox_token');
    return fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => res.blob());
}

// 创建订单
export function createOrder(data) {
    return api.post('/api/orders', data);
}

// 更新订单
export function updateOrder(id, data) {
    return api.put(`/api/orders/${id}`, data);
}

// 退款
export function refundOrder(id) {
    return api.post(`/api/orders/${id}/refund`);
}