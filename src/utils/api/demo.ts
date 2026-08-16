import { api, type ApiQueryParams } from './index'
import type { components } from '@/shared/api/openapi.generated'

type EntityId = string | number
type Schemas = components['schemas']

export interface DemoRunCreatePayload {
  client_demo_run_id: string
  tool_id: string
  tool_name: string
  platform_key: string
  scenario_id: string
  total_step_count: number
}

export interface DemoRunProgressPayload {
  event_seq: number
  status: 'running' | 'paused' | 'cancelled' | 'error'
  current_step_id?: string | null
  completed_step_count: number
  error_code?: string | null
}

export interface DemoRunFinishPayload {
  event_seq: number
  completed_step_count: number
}

export const createDemoRun = ({ client_demo_run_id, ...payload }: DemoRunCreatePayload): Promise<Schemas['DemoRunResponse']> =>
  api.post('/api/demo/runs', payload, { headers: { 'Idempotency-Key': client_demo_run_id } })

export const updateDemoRun = (runId: EntityId, payload: DemoRunProgressPayload): Promise<Schemas['DemoRunResponse']> =>
  api.patch(`/api/demo/runs/${encodeURIComponent(runId)}`, payload)

export const finishDemoRun = (runId: EntityId, payload: DemoRunFinishPayload): Promise<Schemas['DemoRunResponse']> =>
  api.post(`/api/demo/runs/${encodeURIComponent(runId)}/finish`, payload)

export const cancelDemoRun = (runId: EntityId, eventSeq: number): Promise<Schemas['DemoRunResponse']> =>
  api.post(`/api/demo/runs/${encodeURIComponent(runId)}/cancel`, { event_seq: eventSeq })

export const getDemoRuns = (params: ApiQueryParams = {}): Promise<Schemas['DemoRunResponse'][]> =>
  api.get('/api/demo/runs', params, { cache: false })

export interface DemoBatchCreatePayload {
  client_demo_batch_id: string
  tool_id: string
  tool_name: string
  platform_key: string
  scenario_id: string
  row_count: number
}

export const createDemoBatch = ({ client_demo_batch_id, ...payload }: DemoBatchCreatePayload): Promise<Schemas['DemoBatchResponse']> =>
  api.post('/api/demo/batches', payload, { headers: { 'Idempotency-Key': client_demo_batch_id } })

export const updateDemoBatch = (batchId: EntityId, payload: Schemas['DemoBatchUpdate']): Promise<Schemas['DemoBatchResponse']> =>
  api.patch(`/api/demo/batches/${encodeURIComponent(batchId)}`, payload)

export const updateDemoBatchItem = (batchId: EntityId, itemRef: string, payload: Schemas['DemoBatchItemUpdate']): Promise<Schemas['DemoBatchItemResponse']> =>
  api.put(`/api/demo/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(itemRef)}`, payload)

export const finishDemoBatch = (batchId: EntityId, payload: Schemas['DemoEvent']): Promise<Schemas['DemoBatchResponse']> =>
  api.post(`/api/demo/batches/${encodeURIComponent(batchId)}/finish`, payload)

export const getDemoBatches = (params: ApiQueryParams = {}): Promise<Schemas['DemoBatchResponse'][]> =>
  api.get('/api/demo/batches', params, { cache: false })
