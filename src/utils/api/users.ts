import { api } from './index'
import type { components } from '@/shared/api/openapi.generated'

type EntityId = string | number
type Schemas = components['schemas']
type UserList = Schemas['UserListEnvelope']['data']

export const getUsers = (): Promise<UserList> => api.get('/api/users')
export const updateUser = (id: EntityId, data: Schemas['UserUpdate']): Promise<Schemas['UserItemEnvelope']> =>
  api.put(`/api/users/${id}`, data)
