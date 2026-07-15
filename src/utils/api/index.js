// API 基础配置
// 服务器地址优先级:
// 1. Electron 注入的控制面地址 (toolbox_control_api_base)
// 2. 旧版 Electron 地址 (toolbox_api_base)
// 3. 环境变量 VITE_CONTROL_API_BASE / VITE_API_BASE
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
    try {
        const runtimeApiBase = window.electronAPI?.runtime?.controlApiBase;
        if (runtimeApiBase) return runtimeApiBase;
    } catch (e) {
        // Non-Electron runtime: continue with storage and environment configuration.
    }
    // Electron 会在窗口加载后注入这个值
    try {
        const controlApiBase = localStorage.getItem('toolbox_control_api_base');
        if (controlApiBase) return controlApiBase;
        const electronApiBase = localStorage.getItem('toolbox_api_base');
        if (electronApiBase) return electronApiBase;
    } catch (e) {
        // localStorage 不可用时忽略
    }
    
    // Vite 环境变量
    const viteApiBase = import.meta.env.VITE_CONTROL_API_BASE || import.meta.env.VITE_API_BASE;
    if (viteApiBase) return viteApiBase;
    
    // 默认值：开发环境和打包应用都使用本地后端（toolbox-backend.exe）
    return 'http://localhost:8000';
}

// API_BASE 动态获取（不再在模块加载时固定，让 Electron 有时间注入 localStorage）
const API_BASE = getApiBase();

// 请求去重缓存
const pendingRequests = new Map();

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2秒

export class ApiError extends Error {
    constructor(message, status = 0, data = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

// 延迟函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 获取存储的 JWT Token（使用 AuthService）
function getAuthToken() {
    try {
        const auth = authService.getAuth();
        return auth?.token || sessionStorage.getItem('toolbox_token') || localStorage.getItem('toolbox_token');
    } catch (e) {
        return null;
    }
}

// 统一请求方法（带防重复和重试）
export async function request(url, options = {}) {
    const token = getAuthToken();
    const method = (options.method || 'GET').toUpperCase();
    const isIdempotent = method === 'GET';
    
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
    const key = `${method}:${url}`;

    // 如果相同请求正在进行中，返回之前的 Promise
    if (isIdempotent && pendingRequests.has(key)) {
        return pendingRequests.get(key);
    }

    const fetchPromise = (async () => {
        let lastError;
        const maxAttempts = isIdempotent ? MAX_RETRIES + 1 : 1;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            let timeoutId;
            try {
                const controller = new AbortController();
                timeoutId = setTimeout(() => controller.abort(), 10000);

                // 每次请求动态获取 API 地址，确保 Electron 注入的 localStorage 生效
                const baseUrl = getApiBase();
                const response = await fetch(`${baseUrl}${url}`, {
                    ...config,
                    signal: controller.signal,
                });
                // 安全解析 JSON，防止非 JSON 响应导致崩溃
                let data;
                try {
                    data = await response.json();
                } catch (parseError) {
                    throw new ApiError(`服务器返回非JSON响应: ${response.status}`, response.status);
                }

                if (!response.ok) {
                    // 401 或明确的认证失效错误才清理会话；套餐/平台权限 403 保持登录。
                    const authInvalidCodes = new Set([2000, 2001, 2002, 3000, 3001, 3002]);
                    const shouldClearAuth = response.status === 401 || (
                        response.status === 403 && authInvalidCodes.has(data?.error_code)
                    );
                    if (shouldClearAuth) {
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
                    throw new ApiError(
                        data.detail || data.message || `请求失败: ${response.status}`,
                        response.status,
                        data
                    );
                }

                return data;
            } catch (error) {
                lastError = error;
                console.error(`API Error (attempt ${attempt + 1}/${maxAttempts}): ${url}`, error);
                if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
                    throw error;
                }
                if (attempt < maxAttempts - 1) {
                    await delay(RETRY_DELAY);
                }
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        }
        throw lastError;
    })();

    if (isIdempotent) {
        pendingRequests.set(key, fetchPromise);
        const cleanup = () => pendingRequests.delete(key);
        fetchPromise.then(cleanup, cleanup);
    }
    
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
        return request(url, { method: 'POST', body: data }).then(result => {
            clearApiCache(url.split('/').slice(0, 3).join('/'));
            return result;
        });
    },

    put: (url, data = {}) => {
        return request(url, { method: 'PUT', body: data }).then(result => {
            clearApiCache(url.split('/').slice(0, 3).join('/'));
            return result;
        });
    },
    patch: (url, data = {}) => {
        return request(url, { method: 'PATCH', body: data }).then(result => {
            clearApiCache(url.split('/').slice(0, 3).join('/'));
            return result?.data !== undefined ? result.data : result;
        });
    },

    delete: (url) => {
        return request(url, { method: 'DELETE' }).then(result => {
            clearApiCache(url.split('/').slice(0, 3).join('/'));
            return result;
        });
    },
};

// ===== 从子模块 re-export 所有业务函数 =====
// 这样保持向后兼容，所有 `import { xxx } from '@/utils/api'` 仍然有效

export { verifyAuthCode, adminLogin, checkAuthStatus, getCurrentUser } from './auth.js';
export { getAuthCodes, batchGenerateAuthCodes, updateAuthCode, deleteAuthCode } from './auth-codes.js';
export { getPlans, getPlansAdmin } from './plans.js';
export { getOrders, exportOrders, createOrder, updateOrder, refundOrder } from './orders.js';
export { getUsers, updateUser } from './users.js';
export { getDevices, getMyDevices, unbindDevice, userUnbindDevice } from './devices.js';
export { getKnowledgeList, getKnowledgeCategories, getKnowledgeStats, getKnowledge, createKnowledge, updateKnowledge, deleteKnowledge, batchImportKnowledge, syncKnowledgeVector, testKnowledgeRetrieval } from './knowledge.js';
export { createChatSession, getChatSession, sendChatMessage, resolveChatSession, transferChatToHuman, rateChatSession, getChatHistory, getAIChatConfig, updateAIChatConfig, getAdminChatSessions, getAdminChatSession, getAIChatStats, debugAIChat } from './ai-chat.js';
export { getAnnouncements, getActiveAnnouncements, getAnnouncementFeed, markAnnouncementRead, dismissAnnouncement, createAnnouncement, updateAnnouncement, deleteAnnouncement } from './announcements.js';
export { getTools, getToolCategories, updateTools, updateToolCategories, createToolLaunchGrant } from './tools.js';
export { getToolReleases, createToolRelease, publishToolRelease, rollbackToolRelease } from './tool-releases.js';
export { getFeedbacks, getMyFeedbacks, createFeedback, updateFeedback } from './feedback.js';
export { getLogs, exportLogs, getLogTools, createLog } from './logs.js';
export { getDashboard, getDashboardCharts, getProfit, getProfitSummary } from './dashboard.js';
export { getBusinessBootstrap, getBusinessTools, getBusinessBatches, getBusinessBatch, createBusinessBatch, updateBusinessBatch, updateBusinessBatchItem, finishBusinessBatch, getAdminActionCenter, getAdminBusinessBatch } from './business.js';
export { getSettings, updateSetting } from './settings.js';

// 导出 API_BASE 供其他模块使用
export { API_BASE };
