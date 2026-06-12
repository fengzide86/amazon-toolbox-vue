/**
 * 测试辅助工具
 * 提供带 Pinia 的组件挂载函数
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

/**
 * 挂载组件并自动注入 Pinia
 * @param {Object} component - Vue 组件
 * @param {Object} options - mount 选项
 * @returns {Object} wrapper
 */
export function mountWithPinia(component, options = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  
  return mount(component, {
    ...options,
    global: {
      ...options.global,
      plugins: [pinia, ...(options.global?.plugins || [])],
    },
  })
}