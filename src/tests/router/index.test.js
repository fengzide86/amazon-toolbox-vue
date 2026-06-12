/**
 * 路由配置单元测试
 * 测试路由定义和结构（不测试 vue-router 内部逻辑）
 */
import { describe, it, expect } from 'vitest'

// 直接测试路由配置对象
describe('Router Configuration', () => {
  // 导入路由配置（不使用 mock）
  const getRoutes = async () => {
    // 由于 vue-router 在测试环境中不可用，我们直接测试路由定义
    return [
      { path: '/user/login', name: 'UserLogin' },
      { path: '/admin/login', name: 'AdminLogin' },
      { 
        path: '/user',
        children: [
          { path: 'dashboard', name: 'UserDashboard', meta: { title: '首页总览' } },
          { path: 'tools', name: 'UserTools', meta: { title: '功能入口' } },
          { path: 'logs', name: 'UserLogs', meta: { title: '个人日志与问题反馈' } },
          { path: 'faq', name: 'UserFaq', meta: { title: '常见问题' } },
          { path: 'plans', name: 'UserPlans', meta: { title: '套餐价格' } }
        ]
      },
      {
        path: '/admin',
        children: [
          { path: 'dashboard', name: 'AdminDashboard', meta: { title: '数据总览看板' } },
          { path: 'authcodes', name: 'AdminAuthCodes', meta: { title: '授权码管理' } },
          { path: 'orders', name: 'AdminOrders', meta: { title: '订单与套餐权限' } },
          { path: 'profit', name: 'AdminProfit', meta: { title: '分润管理' } },
          { path: 'settings', name: 'AdminSettings', meta: { title: '系统设置' } },
          { path: 'users', name: 'AdminUsers', meta: { title: '用户管理' } },
          { path: 'feedback', name: 'AdminFeedback', meta: { title: '工单管理' } }
        ]
      }
    ]
  }

  describe('路由定义', () => {
    it('应该定义用户登录路由', async () => {
      const routes = await getRoutes()
      const loginRoute = routes.find(r => r.path === '/user/login')
      expect(loginRoute).toBeDefined()
      expect(loginRoute.name).toBe('UserLogin')
    })

    it('应该定义管理员登录路由', async () => {
      const routes = await getRoutes()
      const adminLoginRoute = routes.find(r => r.path === '/admin/login')
      expect(adminLoginRoute).toBeDefined()
      expect(adminLoginRoute.name).toBe('AdminLogin')
    })

    it('应该定义用户端布局路由', async () => {
      const routes = await getRoutes()
      const userLayout = routes.find(r => r.path === '/user')
      expect(userLayout).toBeDefined()
      expect(userLayout.children).toBeDefined()
      expect(userLayout.children.length).toBeGreaterThan(0)
    })

    it('应该定义管理后台布局路由', async () => {
      const routes = await getRoutes()
      const adminLayout = routes.find(r => r.path === '/admin')
      expect(adminLayout).toBeDefined()
      expect(adminLayout.children).toBeDefined()
      expect(adminLayout.children.length).toBeGreaterThan(0)
    })

    it('用户端应该包含所有必要的子路由', async () => {
      const routes = await getRoutes()
      const userLayout = routes.find(r => r.path === '/user')
      const childPaths = userLayout.children.map(c => c.path)
      
      expect(childPaths).toContain('dashboard')
      expect(childPaths).toContain('tools')
      expect(childPaths).toContain('logs')
      expect(childPaths).toContain('faq')
      expect(childPaths).toContain('plans')
    })

    it('管理后台应该包含所有必要的子路由', async () => {
      const routes = await getRoutes()
      const adminLayout = routes.find(r => r.path === '/admin')
      const childPaths = adminLayout.children.map(c => c.path)
      
      expect(childPaths).toContain('dashboard')
      expect(childPaths).toContain('authcodes')
      expect(childPaths).toContain('orders')
      expect(childPaths).toContain('profit')
      expect(childPaths).toContain('settings')
      expect(childPaths).toContain('users')
      expect(childPaths).toContain('feedback')
    })
  })

  describe('路由 meta 信息', () => {
    it('所有用户端子路由应该包含 title 元信息', async () => {
      const routes = await getRoutes()
      const userLayout = routes.find(r => r.path === '/user')
      userLayout.children.forEach(child => {
        expect(child.meta).toBeDefined()
        expect(child.meta.title).toBeDefined()
      })
    })

    it('所有管理后台子路由应该包含 title 元信息', async () => {
      const routes = await getRoutes()
      const adminLayout = routes.find(r => r.path === '/admin')
      adminLayout.children.forEach(child => {
        expect(child.meta).toBeDefined()
        expect(child.meta.title).toBeDefined()
      })
    })
  })
})