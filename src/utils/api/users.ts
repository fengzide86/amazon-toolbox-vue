import { api } from './index'

type EntityId = string | number

export const getUsers = (): Promise<unknown> => api.get('/api/users')
export const updateUser = (id: EntityId, data: unknown): Promise<unknown> => api.put(`/api/users/${id}`, data)
