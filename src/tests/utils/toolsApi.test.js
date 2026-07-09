import { afterEach, describe, expect, it, vi } from 'vitest'
import { createToolLaunchGrant } from '@/utils/api/tools'

describe('tools API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('通过统一控制面 API 申请启动授权并解包 data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          expires_in: 300,
          launch_data: { token: 'grant-token', script_key: 'amazon.listing.v1' },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const grant = await createToolLaunchGrant('tool listing', {
      platformKey: 'amazon',
      deviceId: 'device-1',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/tools/tool%20listing/launch-grant?platform_key=amazon',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(grant.launch_data.token).toBe('grant-token')
  })
})
