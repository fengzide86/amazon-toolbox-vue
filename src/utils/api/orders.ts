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
export const updateOrder = (id: EntityId, data: unknown): Promise<unknown> => api.patch(`/api/orders/${encodeURIComponent(String(id))}`, data)
export const markOrderPaid = (id: EntityId): Promise<unknown> => api.post(`/api/orders/${encodeURIComponent(String(id))}/mark-paid`)
export const cancelOrder = (id: EntityId, reason: string): Promise<unknown> => api.post(`/api/orders/${encodeURIComponent(String(id))}/cancel`, { reason })
export const refundOrder = (id: EntityId, reason: string): Promise<unknown> => api.post(`/api/orders/${encodeURIComponent(String(id))}/refund`, { reason })
