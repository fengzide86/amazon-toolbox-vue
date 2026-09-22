import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import LandingDesktopHandoff from '@/components/landing/LandingDesktopHandoff.vue'

describe('mobile desktop handoff', () => {
  let wrapper: VueWrapper | undefined
  const writeText = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    writeText.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })
  const url = 'https://download.test/KST%20Setup.exe'
  it('shows the real link and installation boundary, and copies only on click', async () => {
    wrapper = mount(LandingDesktopHandoff, { props: { open: false, url } })
    await wrapper.setProps({ open: true })
    expect(wrapper.text()).toContain('手机不能运行安装包')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe(url)
    expect(writeText).not.toHaveBeenCalled()
    await wrapper.find('.copy-link').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(url)
    expect(wrapper.find('[role="status"]').text()).toContain('已复制')
  })
  it('offers manual copy on denial and closes with Esc without downloading', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    wrapper = mount(LandingDesktopHandoff, { props: { open: false, url } })
    await wrapper.setProps({ open: true })
    await wrapper.find('.copy-link').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="status"]').text()).toContain('手动复制')
    await wrapper.find('dialog').trigger('cancel')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
