import { api, type ApiQueryParams } from './index'
import type { components } from '@/shared/api/openapi.generated'

type Schemas = components['schemas']

export const getDashboard = (params: ApiQueryParams = {}): Promise<Schemas['DashboardStatsResponse']['data']> =>
  api.get('/api/dashboard', params)
export const getDashboardCharts = (params: ApiQueryParams = {}): Promise<Schemas['DashboardChartsResponse']['data']> =>
  api.get('/api/dashboard/charts', params)
export const getProfit = (params: ApiQueryParams = {}): Promise<Schemas['ProfitRecordPageResponse']['data']> =>
  api.get('/api/profit', params)
export const getProfitSummary = (params: ApiQueryParams = {}): Promise<Schemas['ProfitSummaryResponse']> =>
  api.get('/api/profit/summary', params)
export const getProfitPolicy = (): Promise<Schemas['APIResponse_ProfitPolicyResponse_']['data']> =>
  api.get('/api/profit/policy', {}, { cache: false })
export const updateProfitPolicy = (ratios: Schemas['ProfitPolicyUpdate']['ratios']): Promise<Schemas['APIResponse_ProfitPolicyResponse_']> =>
  api.put('/api/profit/policy', { ratios })
