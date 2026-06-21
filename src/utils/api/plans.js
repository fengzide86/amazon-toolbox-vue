// 套餐相关 API
import { api } from './index.js';

// 获取套餐列表
export function getPlans() {
    return api.get('/api/plans');
}