// API 基础配置
// 服务器地址优先级:
// 1. Electron 注入的 localStorage (toolbox_api_base)
// 2. 环境变量 VITE_API_BASE
// 3. 默认值（开发环境用本地，生产环境用云端）

import { getCache, setCache, generateCacheKey } from './cache.js';
import { authService } from './auth.js';

// 缓存配置
const CACHE_ENABLED = true;
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// 需要缓存的 GET 请求路径（正则匹配）
const CACHE_PATTERNS = [
    /\/api\/plans$/,
    /\/api\/tools$/,
    /\/api\/tools\/categories$/,
    /\/api\/settings$/,
    /\/api\/logs\/tools/,
];

// 检查是否应该缓存该请求
function shouldCache(url) {
    if (!CACHE_ENABLED) return false;
    return CACHE_PATTERNS.some(pattern => pattern.test(url));
}

function getApiBase() {
    // Electron 会在窗口加载后注入这个值
    try {
        const electronApiBase = localStorage.getItem('toolbox_api_base');
        if (electronApiBase) return electronApiBase;
    } catch (e) {
        // localStorage 不可用时忽略
    }
    
    // Vite 环境变量
    const viteApiBase = import.meta.env.VITE_API_BASE;
    if (viteApiBase) return viteApiBase;
    
    // 默认值：根据环境判断
    return import.meta.env.DEV 
        ? 'http://localhost:8000' 
        : 'http://8.130.113.104:8000';
}

const API_BASE = getApiBase();

// 请求去重缓存
const pendingRequests = new Map();

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2秒

// 延迟函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 获取存储的 JWT Token（使用 AuthService）
function getAuthToken() {
    try {
        const auth = authService.getAuth();
        return auth?.token || localStorage.getItem('toolbox_token');
    } catch (e) {
        return null;
    }
}

// 统一请求方法（带防重复和重试）
export async function request(url, options = {}) {
    const token = getAuthToken();
    
    const defaultHeaders = {
        'Content-Type': 'application/json',
    };
    
    // 如果有 Token，添加到请求头
    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    // 如果有body且不是FormData，转为JSON
    if (config.body && !(config.body instanceof FormData)) {
        config.body = JSON.stringify(config.body);
    }

    // 生成请求唯一标识
    const key = `${config.method || 'GET'}:${url}:${config.body || ''}`;

    // 如果相同请求正在进行中，返回之前的 Promise
    if (pendingRequests.has(key)) {
        return pendingRequests.get(key);
    }

    const fetchPromise = (async () => {
        let lastError;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时（500人规模优化）

                const response = await fetch(`${API_BASE}${url}`, {
                    ...config,
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);

                // 安全解析 JSON，防止非 JSON 响应导致崩溃
                let data;
                try {
                    data = await response.json();
                } catch (parseError) {
                    throw new Error(`服务器返回非JSON响应: ${response.status}`);
                }

                if (!response.ok) {
                    // 全局处理 401/403 错误（授权码被冻结、被踢出等）
                    if (response.status === 401 || response.status === 403) {
                        const auth = authService.getAuth();
                        const role = authService.getRole();
                        // 避免在登录页重复跳转
                        if (auth && role !== 'admin') {
                            authService.clear();
                            // 仅在非登录页跳转
                            if (!window.location.hash.includes('/login')) {
                                window.location.hash = '#/user/login';
                            }
                        }
                    }
                    // 4xx 客户端错误不重试，直接抛出
                    if (response.status >= 400 && response.status < 500) {
                        throw new Error(data.detail || data.message || `请求失败: ${response.status}`);
                    }
                    // 5xx 服务器错误继续重试
                    throw new Error(data.detail || data.message || `服务器错误: ${response.status}`);
                }

                return data;
            } catch (error) {
                lastError = error;
                // 区分错误类型
                const isClientError = error.message.includes('请求失败: 4');

                console.error(`API Error (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${url}`, error);

                // 客户端错误（4xx）不重试
                if (isClientError) {
                    throw error;
                }

                if (attempt < MAX_RETRIES) {
                    await delay(RETRY_DELAY);
                }
            }
        }
        throw lastError;
    })();

    pendingRequests.set(key, fetchPromise);
    
    // 请求完成后清理缓存，防止内存泄漏
    fetchPromise.finally(() => {
        pendingRequests.delete(key);
    });
    
    return fetchPromise;
}

// 清除指定 URL 的缓存
export function clearApiCache(url) {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith('toolbox_cache_') && key.includes(url)) {
            localStorage.removeItem(key);
        }
    });
}

// 快捷方法
export const api = {
    get: (url, params = {}, options = {}) => {
        // 过滤掉 undefined 值，避免 URLSearchParams 将其序列化为字符串 "undefined"
        const filteredParams = Object.fromEntries(
            Object.entries(params).filter(([_, v]) => v !== undefined && v !== null)
        );
        const queryString = new URLSearchParams(filteredParams).toString();
        const fullUrl = queryString ? `${url}?${queryString}` : url;
        
        // 检查是否使用缓存
        if (options.cache !== false && shouldCache(url)) {
            const cacheKey = generateCacheKey(fullUrl);
            const cached = getCache(cacheKey);
            if (cached !== null) {
                return Promise.resolve(cached);
            }
            
            // 请求并缓存
            return request(fullUrl, { method: 'GET' }).then(response => {
                const result = response.data !== undefined ? response.data : response;
                setCache(cacheKey, result, CACHE_TTL);
                return result;
            });
        }
        
        return request(fullUrl, { method: 'GET' }).then(response => {
            return response.data !== undefined ? response.data : response;
        });
    },

    post: (url, data = {}) => {
        return request(url, { method: 'POST', body: data });
    },

    put: (url, data = {}) => {
        return request(url, { method: 'PUT', body: data });
    },

    delete: (url) => {
        return request(url, { method: 'DELETE' });
    },
};

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

// 获取套餐列表
export function getPlans() {
    return api.get('/api/plans');
}

// 获取授权码列表（支持平台过滤）
export function getAuthCodes(params = {}) {
    return api.get('/api/auth-codes', params);
}

// 批量生成授权码
export function batchGenerateAuthCodes(data) {
    return api.post('/api/auth-codes/batch-generate', data);
}

// 更新授权码
export function updateAuthCode(id, data) {
    return api.put(`/api/auth-codes/${id}`, data);
}

// 删除授权码
export function deleteAuthCode(id) {
    return api.delete(`/api/auth-codes/${id}`);
}

// 获取订单列表（支持平台过滤）
export function getOrders(params = {}) {
    return api.get('/api/orders', params);
}

// 导出订单
export function exportOrders(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `${API_BASE}/api/orders/export${queryString ? '?' + queryString : ''}`;
    return fetch(url, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
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

// 获取用户列表
export function getUsers() {
    return api.get('/api/users');
}

// 更新用户
export function updateUser(id, data) {
    return api.put(`/api/users/${id}`, data);
}

// 获取运行日志（支持筛选）
export function getLogs(userIdOrParams = {}) {
    // 支持传入数字类型的 userId 或对象类型的参数
    const params = typeof userIdOrParams === 'number' 
        ? { user_id: userIdOrParams } 
        : userIdOrParams;
    return api.get('/api/logs', params);
}

// 导出日志
export function exportLogs(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `${API_BASE}/api/logs/export${queryString ? '?' + queryString : ''}`;
    return fetch(url, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    }).then(res => res.blob());
}

// 获取日志中的工具名称列表
export function getLogTools(userId = null) {
    return api.get('/api/logs/tools', userId ? { user_id: userId } : {});
}

// 提交日志
export function createLog(data) {
    return api.post('/api/logs', data);
}

// 获取工单列表（管理员）
export function getFeedbacks(params = {}) {
    return api.get('/api/feedback', params);
}

// 获取我的工单列表（用户端）
export function getMyFeedbacks(params = {}) {
    return api.get('/api/feedback/my', params);
}

// 提交工单
export function createFeedback(data) {
    return api.post('/api/feedback', data);
}

// 更新工单
export function updateFeedback(id, data) {
    return api.put(`/api/feedback/${id}`, data);
}

// 获取数据看板（支持平台过滤）
export function getDashboard(params = {}) {
    return api.get('/api/dashboard', params);
}

// 获取图表数据（支持平台过滤）
export function getDashboardCharts(params = {}) {
    return api.get('/api/dashboard/charts', params);
}

// 获取分润记录（支持平台过滤）
export function getProfit(params = {}) {
    return api.get('/api/profit', params);
}

// 获取分润汇总（支持平台过滤）
export function getProfitSummary(params = {}) {
    return api.get('/api/profit/summary', params);
}

// 获取系统设置
export function getSettings() {
    return api.get('/api/settings');
}

// 更新系统设置
export function updateSetting(data) {
    return api.put('/api/settings', data);
}

// 获取工具配置（支持分类和搜索）
export function getTools(params = {}) {
    return api.get('/api/tools', params);
}

// 获取工具分类列表
export function getToolCategories() {
    return api.get('/api/tools/categories');
}

// 更新工具配置
export function updateTools(tools) {
    return api.put('/api/tools', tools);
}

// 更新工具分类配置
export function updateToolCategories(categories) {
    return api.put('/api/tools/categories', categories);
}

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

// ===== 知识库管理 API =====

// 获取知识库列表
export function getKnowledgeList(params = {}) {
    return api.get('/api/knowledge', params);
}

// 获取知识库分类
export function getKnowledgeCategories() {
    return api.get('/api/knowledge/categories');
}

// 获取知识库统计
export function getKnowledgeStats() {
    return api.get('/api/knowledge/stats');
}

// 获取知识条目详情
export function getKnowledge(id) {
    return api.get(`/api/knowledge/${id}`);
}

// 创建知识条目
export function createKnowledge(data) {
    return api.post('/api/knowledge', data);
}

// 更新知识条目
export function updateKnowledge(id, data) {
    return api.put(`/api/knowledge/${id}`, data);
}

// 删除知识条目
export function deleteKnowledge(id) {
    return api.delete(`/api/knowledge/${id}`);
}

// 批量导入知识
export function batchImportKnowledge(items) {
    return api.post('/api/knowledge/batch-import', items);
}

// 同步到向量库
export function syncKnowledgeVector() {
    return api.post('/api/knowledge/sync-vector');
}

// ===== AI 客服 API =====

// 创建会话
export function createChatSession() {
    return api.post('/api/ai-chat/session');
}

// 获取会话详情
export function getChatSession(sessionId) {
    return api.get(`/api/ai-chat/session/${sessionId}`);
}

// 发送消息（非流式）
export function sendChatMessage(sessionId, message) {
    return api.post(`/api/ai-chat/session/${sessionId}/message`, { message });
}

// 标记已解决
export function resolveChatSession(sessionId, satisfaction = null) {
    return api.post(`/api/ai-chat/session/${sessionId}/resolve`, { satisfaction });
}

// 转人工
export function transferChatToHuman(sessionId) {
    return api.post(`/api/ai-chat/session/${sessionId}/transfer`);
}

// 满意度评分
export function rateChatSession(sessionId, satisfaction) {
    return api.post(`/api/ai-chat/session/${sessionId}/rate`, { satisfaction });
}

// 获取对话历史
export function getChatHistory(page = 1, pageSize = 10) {
    return api.get('/api/ai-chat/history', { page, page_size: pageSize });
}

// 获取 AI 客服配置
export function getAIChatConfig() {
    return api.get('/api/ai-chat/admin/config');
}

// 更新 AI 客服配置
export function updateAIChatConfig(data) {
    return api.put('/api/ai-chat/admin/config', data);
}

// 获取所有对话记录（管理员）
export function getAdminChatSessions(params = {}) {
    return api.get('/api/ai-chat/admin/sessions', params);
}

// 获取对话详情（管理员）
export function getAdminChatSession(sessionId) {
    return api.get(`/api/ai-chat/admin/sessions/${sessionId}`);
}

// 获取 AI 客服统计
export function getAIChatStats() {
    return api.get('/api/ai-chat/admin/stats');
}

// ===== Announcements =====
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

// 导出 API_BASE 供其他模块使用
export { API_BASE };
