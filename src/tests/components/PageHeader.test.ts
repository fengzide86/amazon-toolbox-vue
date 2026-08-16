import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import { provideShellPageHeader } from '@/features/shell/pageHeaderContext'

describe('PageHeader', () => {
  it('没有壳层上下文时在页面内正常显示', () => {
    const wrapper = mount(PageHeader, {
      props: { eyebrow: 'TEST', title: '页面标题', description: '页面说明' },
    })

    expect(wrapper.get('.page-header-v6 h2').text()).toBe('页面标题')
    expect(wrapper.get('.page-header-v6 p').text()).toBe('页面说明')
  })

  it('在壳层中注册标题并把操作传送到顶部操作区', async () => {
    const target = document.createElement('div')
    target.id = 'shell-page-actions'
    document.body.appendChild(target)
    const Host = defineComponent({
      components: { PageHeader },
      setup() {
        const context = provideShellPageHeader()
        return { header: context.current }
      },
      template: `
        <section>
          <span data-testid="registered-title">{{ header?.title }}</span>
          <PageHeader eyebrow="TEST" title="合并标题" description="合并说明">
            <template #actions><button class="page-action">刷新</button></template>
          </PageHeader>
        </section>
      `,
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="registered-title"]').text()).toBe('合并标题')
    expect(document.querySelector('#shell-page-actions .page-action')?.textContent).toBe('刷新')
    expect(wrapper.find('.page-header-v6 h2').exists()).toBe(false)
    wrapper.unmount()
    target.remove()
  })
})
