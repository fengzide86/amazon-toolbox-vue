import { api, type ApiQueryParams } from './index'

export const getDashboard = (params: ApiQueryParams = {}): Promise<unknown> => api.get('/api/dashboard', params)
export const getDashboardCharts = (params: ApiQueryParams = {}): Promise<unknown> => api.get('/api/dashboard/charts', params)
export const getProfit = (params: ApiQueryParams = {}): Promise<unknown> => api.get('/api/profit', params)
export const getProfitSummary = (params: ApiQueryParams = {}): Promise<unknown> => api.get('/api/profit/summary', params)
