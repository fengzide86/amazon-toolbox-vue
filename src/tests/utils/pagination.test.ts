import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizePaginatedResponse } from '@/shared/api/pagination'
import { getAdminChatSessions, getChatHistory, getKnowledgeList } from '@/utils/api'

global.fetch = vi.fn()
const mockedFetch = global.fetch as ReturnType<typeof vi.fn>

function successfulJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  }
}

describe('normalizePaginatedResponse', () => {
  it('保留后端直出分页响应的总数和页码', () => {
    expect(normalizePaginatedResponse({
      data: [{ id: 1 }],
      total: 41,
      page: 2,
      page_size: 20,
    })).toEqual({ items: [{ id: 1 }], total: 41, page: 2, page_size: 20 })
  })

  it('兼容旧 items 分页格式', () => {
    expect(normalizePaginatedResponse({
      items: [{ id: 2 }],
      total: 3,
      page: 1,
      page_size: 10,
    })).toEqual({ items: [{ id: 2 }], total: 3, page: 1, page_size: 10 })
  })

  it('兼容外层 success/data 包装格式', () => {
    expect(normalizePaginatedResponse({
      success: true,
      data: { items: [{ id: 3 }], total: 8, page: 3, page_size: 3 },
    })).toEqual({ items: [{ id: 3 }], total: 8, page: 3, page_size: 3 })
  })
})

describe('paginated API adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('知识库列表不会被通用 data 解包丢掉分页元数据', async () => {
    mockedFetch.mockResolvedValueOnce(successfulJson({
      data: [{ id: 7, title: '授权帮助' }],
      items: [{ id: 7, title: '授权帮助' }],
      total: 27,
      page: 2,
      page_size: 20,
    }))

    await expect(getKnowledgeList({ page: 2 })).resolves.toEqual({
      items: [{ id: 7, title: '授权帮助' }],
      total: 27,
      page: 2,
      page_size: 20,
    })
  })

  it('管理端和用户端客服历史使用同一分页契约', async () => {
    mockedFetch
      .mockResolvedValueOnce(successfulJson({ data: [], items: [], total: 0, page: 1, page_size: 20 }))
      .mockResolvedValueOnce(successfulJson({ success: true, data: { items: [], total: 0, page: 1, page_size: 10 } }))

    await expect(getAdminChatSessions()).resolves.toEqual({ items: [], total: 0, page: 1, page_size: 20 })
    await expect(getChatHistory()).resolves.toEqual({ items: [], total: 0, page: 1, page_size: 10 })
  })
})
