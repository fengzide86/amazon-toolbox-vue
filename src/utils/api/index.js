// API 基础配置
// 服务器地址优先级:
// 1. Electron 注入的 localStorage (toolbox_api_base)
// 2. 环境变量 VITE_API_BASE
// 3. 默认值（开发环境用本地，生产环境用云端）

import { getCache, setCache, generateCacheKey } from '../cache.js';
import { authService } from '../auth.js';

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
                        if (auth) {
                            authService.clear();
                            // 避免在登录页重复跳转
                            if (!window.location.hash.includes('/login')) {
                                window.location.hash = role === 'admin' ? '#/admin/login' : '#/user/login';
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

// ===== 从子模块 re-export 所有业务函数 =====
// 这样保持向后兼容，所有 `import { xxx } from '@/utils/api'` 仍然有效

export { verifyAuthCode, adminLogin, checkAuthStatus } from './auth.js';
export { getAuthCodes, batchGenerateAuthCodes, updateAuthCode, deleteAuthCode } from './auth-codes.js';
export { getPlans } from './plans.js';
export { getOrders, exportOrders, createOrder, updateOrder, refundOrder } from './orders.js';
export { getUsers, updateUser } from './users.js';
export { getDevices, getMyDevices, unbindDevice, userUnbindDevice } from './devices.js';
export { getKnowledgeList, getKnowledgeCategories, getKnowledgeStats, getKnowledge, createKnowledge, updateKnowledge, deleteKnowledge, batchImportKnowledge, syncKnowledgeVector } from './knowledge.js';
export { createChatSession, getChatSession, sendChatMessage, resolveChatSession, transferChatToHuman, rateChatSession, getChatHistory, getAIChatConfig, updateAIChatConfig, getAdminChatSessions, getAdminChatSession, getAIChatStats } from './ai-chat.js';
export { getAnnouncements, getActiveAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from './announcements.js';
export { getTools, getToolCategories, updateTools, updateToolCategories } from './tools.js';
export { getFeedbacks, getMyFeedbacks, createFeedback, updateFeedback } from './feedback.js';
export { getLogs, exportLogs, getLogTools, createLog } from './logs.js';
export { getDashboard, getDashboardCharts, getProfit, getProfitSummary } from './dashboard.js';
export { getSettings, updateSetting } from './settings.js';

// 导出 API_BASE 供其他模块使用
export { API_BASE };