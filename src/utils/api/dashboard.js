// 看板相关 API
import { api } from './index.js';

export function getDashboard(params = {}) {
    return api.get('/api/dashboard', params);
}

export function getDashboardCharts(params = {}) {
    return api.get('/api/dashboard/charts', params);
}

export function getProfit(params = {}) {
    return api.get('/api/profit', params);
}

export function getProfitSummary(params = {}) {
    return api.get('/api/profit/summary', params);
}
