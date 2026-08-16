import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BrandLockup from '@/components/brand/BrandLockup.vue'
import BrandMark from '@/components/brand/BrandMark.vue'

describe('KST 品牌组件', () => {
  it.each([
    ['consumer', '个人效率工具箱'],
    ['business', '专业批量工作台'],
    ['admin', '运营控制中心'],
    ['login', '跨境电商赛训效率平台'],
  ] as const)('为 %s 场景显示对应副标题', (audience, subtitle) => {
    const wrapper = mount(BrandLockup, { props: { audience } })

    expect(wrapper.find('.kst-lockup-subtitle').text()).toBe(subtitle)
    expect(wrapper.attributes('aria-label')).toBe(`课赛通 KST，${subtitle}`)
  })

  it('支持横版、竖版和反白资源', async () => {
    const wrapper = mount(BrandLockup, { props: { layout: 'stacked' } })
    expect(wrapper.classes()).toContain('is-stacked')
    expect(wrapper.find('img').attributes('src')).toContain('kst-logo-primary.svg')

    await wrapper.setProps({ layout: 'horizontal', variant: 'inverse' })
    expect(wrapper.classes()).toContain('is-horizontal')
    expect(wrapper.classes()).toContain('is-inverse')
    expect(wrapper.find('img').attributes('src')).toContain('kst-logo-horizontal.svg')

    await wrapper.setProps({ layout: 'stacked' })
    expect(wrapper.find('img').attributes('src')).toContain('kst-logo-inverse.svg')
  })

  it('装饰性锁定组合不重复朗读品牌信息', () => {
    const wrapper = mount(BrandLockup, { props: { decorative: true } })

    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('role')).toBeUndefined()
    expect(wrapper.attributes('aria-label')).toBeUndefined()
  })

  it('图形标支持常规、紧凑和反白形态', async () => {
    const wrapper = mount(BrandMark, { props: { size: 24, label: '课赛通应用图标' } })
    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toBe('课赛通应用图标')
    expect(wrapper.attributes('style')).toContain('--kst-mark-size: 24px')
    const regularSource = wrapper.find('img').attributes('src')
    expect(regularSource).toBeTruthy()

    await wrapper.setProps({ compact: true, variant: 'inverse' })
    expect(wrapper.classes()).toContain('is-compact')
    expect(wrapper.classes()).toContain('is-inverse')
    expect(wrapper.find('img').attributes('src')).not.toBe(regularSource)
  })
})
