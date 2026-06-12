/**
 * Vitest 测试环境配置
 */
import { vi, beforeEach } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString()
    }),
    removeItem: vi.fn(key => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    key: vi.fn(index => Object.keys(store)[index] || null),
    get length() {
      return Object.keys(store).length
    }
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock
})

// Mock window.confirm
globalThis.confirm = vi.fn()

// Mock fetch
globalThis.fetch = vi.fn()

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.clear()
})