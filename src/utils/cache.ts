import { z } from 'zod'

const CACHE_PREFIX = 'toolbox_cache_'
const DEFAULT_TTL = 5 * 60 * 1000

const cacheEntrySchema = z.object({
  data: z.unknown(),
  expiry: z.number(),
  created: z.number(),
})

export interface CacheInfo {
  totalItems: number
  totalSize: number
  items: Array<{ key: string; size: number }>
}

export function setCache(key: string, data: unknown, ttl = DEFAULT_TTL): boolean {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      data,
      expiry: Date.now() + ttl,
      created: Date.now(),
    }))
    return true
  } catch (error) {
    console.warn('Cache set failed:', error)
    return false
  }
}

export function getCache<T = unknown>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const parsed = cacheEntrySchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      localStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    if (Date.now() > parsed.data.expiry) {
      localStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    return parsed.data.data as T
  } catch (error) {
    console.warn('Cache get failed:', error)
    return null
  }
}

export function removeCache(key: string): boolean {
  try {
    localStorage.removeItem(CACHE_PREFIX + key)
    return true
  } catch {
    return false
  }
}

export function clearAllCache(): boolean {
  try {
    const keysToRemove: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(CACHE_PREFIX)) keysToRemove.push(key)
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
    return true
  } catch (error) {
    console.warn('Cache clear failed:', error)
    return false
  }
}

export function getCacheInfo(): CacheInfo {
  const info: CacheInfo = { totalItems: 0, totalSize: 0, items: [] }
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(CACHE_PREFIX)) continue
      const value = localStorage.getItem(key)
      if (value === null) continue
      info.totalItems += 1
      info.totalSize += value.length
      info.items.push({ key: key.slice(CACHE_PREFIX.length), size: value.length })
    }
  } catch (error) {
    console.warn('Cache info failed:', error)
  }
  return info
}

export function generateCacheKey(
  url: string,
  params: Record<string, string | number | boolean> = {},
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${String(params[key])}`)
    .join('&')
  return sortedParams ? `${url}?${sortedParams}` : url
}
