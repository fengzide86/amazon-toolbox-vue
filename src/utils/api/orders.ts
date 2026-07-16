import { api, API_BASE, type ApiQueryParams } from './index'
import { authService } from '../auth'
import { toolboxVersionHeaders } from '@/shared/api/client-metadata'

type EntityId = string | number

export const getOrders = (params: ApiQueryParams = {}): Promise<unknown> => api.get('/api/orders', params)

export async function exportOrders(params: ApiQueryParams = {}): Promise<Blob> {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== null && entry[1] !== undefined)
      .map(([key, value]) => [key, String(value)]),
  ).toString()
  const token = authService.getAuth()?.token || localStorage.getItem('toolbox_token')
  const headers = toolboxVersionHeaders(token ? { Authorization: `Bearer ${token}` } : {})
  const response = await fetch(`${API_BASE}/api/orders/export${query ? `?${query}` : ''}`, { headers })
  return response.blob()
}

export const createOrder = (data: unknown): Promise<unknown> => api.post('/api/orders', data)
export const updateOrder = (id: EntityId, data: unknown): Promise<unknown> => api.put(`/api/orders/${id}`, data)
export const refundOrder = (id: EntityId): Promise<unknown> => api.post(`/api/orders/${id}/refund`)
