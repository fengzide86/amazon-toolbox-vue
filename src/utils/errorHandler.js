/**
 * 全局错误处理工具
 * 提供统一的 API 错误处理和用户提示
 */

// 错误消息映射（中英文）
const ERROR_MESSAGES = {
    'Network Error': '网络连接失败，请检查网络',
    'Request failed': '请求失败，请稍后重试',
    'timeout': '请求超时，请稍后重试',
    '401': '登录已过期，请重新登录',
    '403': '没有权限执行此操作',
    '404': '请求的资源不存在',
    '500': '服务器内部错误，请稍后重试',
    '502': '网关错误，请稍后重试',
    '503': '服务暂时不可用，请稍后重试',
};

/**
 * 获取用户友好的错误消息
 * @param {Error|string} error - 错误对象或消息
 * @returns {string} 用户友好的错误消息
 */
export function getUserFriendlyMessage(error) {
    const message = typeof error === 'string' ? error : error?.message || '';
    
    // 检查是否有映射的错误消息
    for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
        if (message.includes(key)) {
            return value;
        }
    }
    
    // 返回原始消息或默认消息
    return message || '操作失败，请稍后重试';
}

/**
 * 处理 API 错误
 * @param {Error} error - 错误对象
 * @param {string} context - 错误发生的上下文（用于日志）
 */
export function handleApiError(error, context = '') {
    // 记录详细错误到控制台
    console.error(`[API Error] ${context}:`, error);
    
    // 获取用户友好的消息
    const userMessage = getUserFriendlyMessage(error);
    
    // 尝试使用 Element Plus 的 ElMessage 显示错误
    // 如果 Element Plus 未加载，则使用 alert
    try {
        // 动态导入避免循环依赖
        import('element-plus').then(({ ElMessage }) => {
            ElMessage.error(userMessage);
        }).catch(() => {
            // Element Plus 未加载，使用 console
            console.warn(userMessage);
        });
    } catch {
        console.warn(userMessage);
    }
    
    return userMessage;
}

/**
 * 带错误处理的异步函数包装器
 * @param {Function} fn - 要执行的异步函数
 * @param {string} context - 错误上下文
 * @returns {Promise} 包装后的 Promise
 */
export async function withErrorHandling(fn, context = '') {
    try {
        return await fn();
    } catch (error) {
        handleApiError(error, context);
        throw error; // 重新抛出，让调用者决定如何处理
    }
}

/**
 * 静默错误处理（不显示用户提示，只记录日志）
 * @param {Error} error - 错误对象
 * @param {string} context - 错误上下文
 */
export function logError(error, context = '') {
    console.error(`[Error] ${context}:`, error);
}

/**
 * 业务错误类
 * 用于区分业务逻辑错误和系统错误
 */
export class BusinessError extends Error {
    constructor(message, code = 'BUSINESS_ERROR') {
        super(message);
        this.name = 'BusinessError';
        this.code = code;
    }
}