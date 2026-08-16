import { api, type ApiQueryParams } from './index'
import type { components } from '@/shared/api/openapi.generated'

type EntityId = string | number
type Schemas = components['schemas']
type PlanWire = Schemas['PlanResponse']
type PlanEnvelope = Schemas['APIResponse_PlanResponse_']

export const getPlans = (): Promise<PlanWire[]> => api.get('/api/plans')
export const getPlansAdmin = (params: ApiQueryParams = {}): Promise<PlanWire[]> =>
  api.get('/api/plans/admin', params, { cache: false })
export const createPlan = (data: Schemas['PlanCreate']): Promise<PlanEnvelope> => api.post('/api/plans', data)
export const updatePlan = (id: EntityId, data: Schemas['PlanUpdate']): Promise<PlanWire> =>
  api.patch(`/api/plans/${encodeURIComponent(String(id))}`, data)
export const enablePlan = (id: EntityId): Promise<PlanEnvelope> =>
  api.post(`/api/plans/${encodeURIComponent(String(id))}/enable`)
export const disablePlan = (id: EntityId): Promise<PlanEnvelope> =>
  api.post(`/api/plans/${encodeURIComponent(String(id))}/disable`)
export const archivePlan = (id: EntityId): Promise<PlanEnvelope> =>
  api.post(`/api/plans/${encodeURIComponent(String(id))}/archive`)
