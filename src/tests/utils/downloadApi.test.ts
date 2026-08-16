import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/utils/api'
import { downloadApiFile } from '@/utils/api/download'

describe('downloadApiFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    sessionStorage.setItem('toolbox_token', 'download-token')
  })

  it('returns the downloaded file and includes auth/version headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('a,b\n1,2', {
      status: 200,
      headers: { 'content-type': 'text/csv' },
    }))

    const blob = await downloadApiFile('/api/orders/export', { status: 'paid' })

    expect(await blob.text()).toBe('a,b\n1,2')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/orders/export?status=paid'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer download-token' }),
      }),
    )
  })

  it('rejects JSON HTTP failures instead of saving them as a file', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: '导出暂时不可用' }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'X-Request-ID': 'req-download' },
    }))

    await expect(downloadApiFile('/api/logs/export')).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'http',
      status: 503,
      message: '导出暂时不可用',
      requestId: 'req-download',
    } satisfies Partial<ApiError>)
  })

  it('rejects successful JSON payloads as invalid download files', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: '不是文件' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    await expect(downloadApiFile('/api/orders/export')).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'parse',
      message: '不是文件',
    })
  })
})
