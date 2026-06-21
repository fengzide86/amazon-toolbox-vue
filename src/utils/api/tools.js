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
