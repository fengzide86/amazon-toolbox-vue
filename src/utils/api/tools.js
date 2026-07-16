// 工具相关 API
import { api } from './index';

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
export function createToolLaunchGrant(toolId, { platformKey, deviceId, executionMode = 'single', clientBatchId, clientItemId, idempotencyKey } = {}) {
    const params = new URLSearchParams({ platform_key: platformKey || '' });
    const payload = { platform_key: platformKey, device_id: deviceId };
    if (executionMode === 'batch') {
        params.set('execution_mode', 'batch');
        payload.execution_mode = 'batch';
    }
    if (clientBatchId) params.set('client_batch_id', clientBatchId);
    if (clientItemId) params.set('client_item_id', clientItemId);
    if (idempotencyKey) params.set('idempotency_key', idempotencyKey);
    return api.post(
        `/api/tools/${encodeURIComponent(toolId)}/launch-grant?${params.toString()}`,
        payload,
    ).then(response => {
        if (response?.success === false) {
            const error = new Error(response.message || '工具启动失败');
            error.code = response.error_code;
            error.data = response.detail;
            throw error;
        }
        return response?.data ?? response;
    });
}
