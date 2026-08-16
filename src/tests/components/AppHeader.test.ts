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
    { path: '/', component: { template: '<div>Home</div>' } },
    { path: '/user/login', component: { template: '<div>User login</div>' } },
    { path: '/admin/login', component: { template: '<div>Admin login</div>' } }
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
          'router-link': { template: '<a><slot /></a>' },
          'el-select': true,
          'el-option': true,
          'el-dropdown': true,
          'el-dropdown-menu': true,
          'el-dropdown-item': true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.shell-page-copy').exists()).toBe(true)
    expect(wrapper.find('#shell-page-actions').exists()).toBe(true)
    expect(wrapper.find('.mobile-brand-mark').exists()).toBe(true)
    expect(wrapper.find('.mobile-brand-mark').attributes('aria-hidden')).toBe('true')
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
          'router-link': { template: '<a><slot /></a>' },
          'el-select': true,
          'el-option': true,
          'el-dropdown': true,
          'el-dropdown-menu': true,
          'el-dropdown-item': true
        }
      }
    })
    expect(wrapper.props('isAdmin')).toBe(true)
    expect(wrapper.find('.shell-page-copy').exists()).toBe(true)
    expect(wrapper.find('.mobile-brand-mark').exists()).toBe(true)
  })

  it('退出登录后应保留本机设备身份', async () => {
    localStorage.setItem('toolbox_device_id', 'DEV-STABLE-001')
    localStorage.setItem('toolbox_device_name', 'TRAINING-PC')
    localStorage.setItem('toolbox_role', 'user')

    const wrapper = mount(AppHeader, {
      global: {
        plugins: [router],
        stubs: {
          'router-link': { template: '<a><slot /></a>' },
          'el-select': true,
          'el-option': true,
          'el-dropdown': {
            template: '<button class="logout-test" @click="$emit(\'command\', \'logout\')">logout</button>'
          },
          'el-dropdown-menu': true,
          'el-dropdown-item': true
        }
      }
    })

    await wrapper.find('.logout-test').trigger('click')

    expect(localStorage.getItem('toolbox_device_id')).toBe('DEV-STABLE-001')
    expect(localStorage.getItem('toolbox_device_name')).toBe('TRAINING-PC')
    expect(localStorage.getItem('toolbox_role')).toBeNull()
  })
})
