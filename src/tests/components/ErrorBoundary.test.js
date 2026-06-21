/**
 * ErrorBoundary 组件单元测试
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'

describe('ErrorBoundary', () => {
  it('应该正常渲染子组件', () => {
    const ChildComponent = defineComponent({
      render() {
        return h('div', '子组件内容')
      }
    })

    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: ChildComponent
      }
    })

    expect(wrapper.text()).toContain('子组件内容')
  })

  it('应该导出为 Vue 组件', () => {
    expect(ErrorBoundary).toBeDefined()
    expect(typeof ErrorBoundary).toBe('object')
  })

  it('应该有 error 插槽', () => {
    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: '<div>正常内容</div>',
        error: '<div>错误内容</div>'
      }
    })
    
    expect(wrapper.text()).toContain('正常内容')
  })
})