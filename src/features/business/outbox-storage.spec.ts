import { describe, expect, it, vi } from 'vitest'
import { BusinessOutboxStorage } from './outbox-storage'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

describe('BusinessOutboxStorage', () => {
  it('persists only whitelisted state and scopes it by owner', () => {
    const storage = memoryStorage()
    const first = new BusinessOutboxStorage('api:user:auth:device-a', () => storage, vi.fn())
    first.save({ version: 1, items: [{ batchId: 3, itemId: 'row', payload: { status: 'completed', account_label_masked: 'secret', input: { password: 'bad' } } }], batches: [], finishes: [] })
    const loaded = first.load()
    expect(loaded?.items[0]).toEqual({ batchId: 3, itemId: 'row', payload: { status: 'completed' } })
    const other = new BusinessOutboxStorage('api:user:auth:device-b', () => storage, vi.fn())
    expect(other.load()).toBeNull()
    expect(JSON.stringify(loaded)).not.toContain('secret')
    expect(JSON.stringify(loaded)).not.toContain('password')
  })

  it('reports malformed or unavailable storage without throwing', () => {
    const storage = memoryStorage()
    storage.setItem('kst:business-outbox:v1:scope', '{bad')
    const onUnavailable = vi.fn()
    const outbox = new BusinessOutboxStorage('scope', () => storage, onUnavailable)
    expect(outbox.load()).toBeNull()
    expect(onUnavailable).toHaveBeenCalled()
  })
})
