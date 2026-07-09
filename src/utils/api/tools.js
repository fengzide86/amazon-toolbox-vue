// 工具相关 API
import { api } from './index.js';

export function getTools(params = {}) {
    return api.get('/api/tools', params);
}

export function getToolCategories() {
    return api.get('/api/tools/categories');
}

export function updateTools(tools) {
    return api.put('/api/tools', tools);
}

export function updateToolCategories(categories) {
    return api.put('/api/tools/categories', categories);
}

// 向云端控制面申请一次性任务启动授权。
// device_id 仍由登录令牌兜底校验，显式传递用于兼容旧客户端。
export function createToolLaunchGrant(toolId, { platformKey, deviceId } = {}) {
    return api.post(
        `/api/tools/${encodeURIComponent(toolId)}/launch-grant?platform_key=${encodeURIComponent(platformKey || '')}`,
        {
            platform_key: platformKey,
            device_id: deviceId,
        },
    ).then(response => response?.data ?? response);
}
