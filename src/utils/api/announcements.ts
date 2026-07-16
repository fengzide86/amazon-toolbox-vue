import { api } from './index'

type AnnouncementId = string | number

export const getAnnouncements = (status?: string): Promise<unknown> =>
  api.get('/api/announcements', status ? { status } : {})

export const getActiveAnnouncements = (): Promise<unknown> => api.get('/api/announcements/active')
export const getAnnouncementFeed = (): Promise<unknown> => api.get('/api/announcements/feed', {}, { cache: false })
export const markAnnouncementRead = (id: AnnouncementId): Promise<unknown> => api.post(`/api/announcements/${id}/read`)
export const dismissAnnouncement = (id: AnnouncementId): Promise<unknown> => api.post(`/api/announcements/${id}/dismiss`)
export const createAnnouncement = (data: unknown): Promise<unknown> => api.post('/api/announcements', data)
export const updateAnnouncement = (id: AnnouncementId, data: unknown): Promise<unknown> => api.put(`/api/announcements/${id}`, data)
export const deleteAnnouncement = (id: AnnouncementId): Promise<unknown> => api.delete(`/api/announcements/${id}`)
