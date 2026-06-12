/**
 * UpdateProgress 组件测试
 * 测试更新进度显示功能
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import UpdateProgress from '@/components/UpdateProgress.vue'

describe('UpdateProgress', () => {
  let addEventListenerSpy
  let removeEventListenerSpy

  beforeEach(() => {
    vi.useFakeTimers()
    addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    vi.useRealTimers()
    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
  })

  describe('渲染测试', () => {
    it('初始状态不应该显示进度条', () => {
      const wrapper = mount(UpdateProgress)
      expect(wrapper.find('.update-overlay').exists()).toBe(false)
    })

    it('应该包含进度条容器结构', () => {
      const wrapper = mount(UpdateProgress)
      // 初始不渲染，但组件应该存在
      expect(wrapper.exists()).toBe(true)
    })
  })

  describe('事件监听测试', () => {
    it('挂载时应该注册 update-download-progress 事件', () => {
      mount(UpdateProgress)
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'update-download-progress',
        expect.any(Function)
      )
    })

    it('挂载时应该注册 update-progress 事件', () => {
      mount(UpdateProgress)
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'update-progress',
        expect.any(Function)
      )
    })

    it('卸载时应该移除事件监听', () => {
      const wrapper = mount(UpdateProgress)
      wrapper.unmount()
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'update-download-progress',
        expect.any(Function)
      )
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'update-progress',
        expect.any(Function)
      )
    })
  })

  describe('进度更新测试', () => {
    it('接收到进度事件后应该显示进度条', async () => {
      const wrapper = mount(UpdateProgress)
      
      // 触发进度事件
      const event = new CustomEvent('update-progress', {
        detail: {
          percent: 50,
          speed: '2.5',
          transferred: '25',
          total: '50'
        }
      })
      window.dispatchEvent(event)
      await wrapper.vm.$nextTick()
      
      expect(wrapper.find('.update-overlay').exists()).toBe(true)
    })

    it('应该正确显示进度百分比', async () => {
      const wrapper = mount(UpdateProgress)
      
      const event = new CustomEvent('update-progress', {
        detail: {
          percent: 75,
          speed: '3.0',
          transferred: '75',
          total: '100'
        }
      })
      window.dispatchEvent(event)
      await wrapper.vm.$nextTick()
      
      expect(wrapper.find('.progress-percent').text()).toBe('75%')
    })

    it('应该正确显示已传输和总大小', async () => {
      const wrapper = mount(UpdateProgress)
      
      const event = new CustomEvent('update-progress', {
        detail: {
          percent: 30,
          speed: '1.5',
          transferred: '15',
          total: '50'
        }
      })
      window.dispatchEvent(event)
      await wrapper.vm.$nextTick()
      
      const progressDetail = wrapper.find('.progress-detail').text()
      expect(progressDetail).toContain('15MB')
      expect(progressDetail).toContain('50MB')
    })

    it('应该正确显示下载速度', async () => {
      const wrapper = mount(UpdateProgress)
      
      const event = new CustomEvent('update-progress', {
        detail: {
          percent: 50,
          speed: '2.5',
          transferred: '25',
          total: '50'
        }
      })
      window.dispatchEvent(event)
      await wrapper.vm.$nextTick()
      
      const progressDetail = wrapper.find('.progress-detail').text()
      expect(progressDetail).toContain('2.5MB/s')
    })

    it('进度条宽度应该与百分比匹配', async () => {
      const wrapper = mount(UpdateProgress)
      
      const event = new CustomEvent('update-progress', {
        detail: {
          percent: 60,
          speed: '2.0',
          transferred: '30',
          total: '50'
        }
      })
      window.dispatchEvent(event)
      await wrapper.vm.$nextTick()
      
      const progressBar = wrapper.find('.progress-bar')
      expect(progressBar.attributes('style')).toContain('width: 60%')
    })
  })

  describe('完成状态测试', () => {
    it('下载完成后应该显示提示文字', async () => {
      const wrapper = mount(UpdateProgress)
      
      const event = new CustomEvent('update-progress', {
        detail: {
          percent: 100,
          speed: '0',
          transferred: '100',
          total: '100'
        }
      })
      window.dispatchEvent(event)
      await wrapper.vm.$nextTick()
      
      expect(wrapper.find('.update-hint').exists()).toBe(true)
      expect(wrapper.find('.update-hint').text()).toContain('请耐心等待')
    })

    it('下载完成后 2 秒应该隐藏进度条', async () => {
      const wrapper = mount(UpdateProgress)
      
      const event = new CustomEvent('update-progress', {
        detail: {
          percent: 100,
          speed: '0',
          transferred: '100',
          total: '100'
        }
      })
      window.dispatchEvent(event)
      await wrapper.vm.$nextTick()
      
      expect(wrapper.find('.update-overlay').exists()).toBe(true)
      
      // 快进 2 秒
      vi.advanceTimersByTime(2000)
      await wrapper.vm.$nextTick()
      
      expect(wrapper.find('.update-overlay').exists()).toBe(false)
    })
  })

  describe('UI 元素测试', () => {
    it('应该显示下载图标', async () => {
      const wrapper = mount(UpdateProgress)
      
      const event = new CustomEvent('update-progress', {
        detail: { percent: 50, speed: '2', transferred: '25', total: '50' }
      })
      window.dispatchEvent(event)
      await wrapper.vm.$nextTick()
      
      expect(wrapper.find('.update-header svg').exists()).toBe(true)
    })

    it('应该显示"正在下载更新"标题', async () => {
      const wrapper = mount(UpdateProgress)
      
      const event = new CustomEvent('update-progress', {
        detail: { percent: 50, speed: '2', transferred: '25', total: '50' }
      })
      window.dispatchEvent(event)
      await wrapper.vm.$nextTick()
      
      expect(wrapper.find('.update-header h3').text()).toBe('正在下载更新')
    })
  })
})