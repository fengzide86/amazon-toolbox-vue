/**
 * AppHeader 组件单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'

// 创建 mock router
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: { template: '<div>Home</div>' } }
  ]
})

describe('AppHeader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('应该渲染组件', () => {
    const wrapper = mount(AppHeader, {
      global: {
        plugins: [router],
        stubs: {
          'router-link': true,
          'el-select': true,
          'el-option': true,
          'el-dropdown': true,
          'el-dropdown-menu': true,
          'el-dropdown-item': true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('应该导出为 Vue 组件', () => {
    expect(AppHeader).toBeDefined()
    expect(typeof AppHeader).toBe('object')
  })

  it('应该接受 isAdmin prop', () => {
    const wrapper = mount(AppHeader, {
      props: {
        isAdmin: true
      },
      global: {
        plugins: [router],
        stubs: {
          'router-link': true,
          'el-select': true,
          'el-option': true,
          'el-dropdown': true,
          'el-dropdown-menu': true,
          'el-dropdown-item': true
        }
      }
    })
    expect(wrapper.props('isAdmin')).toBe(true)
  })
})