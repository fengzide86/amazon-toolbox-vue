import { createRouter, createWebHashHistory } from 'vue-router'
import { authService } from '@/utils/auth'

const routes = [
  // 用户端路由
  {
    path: '/',
    redirect: '/user/login'
  },
  {
    path: '/user/login',
    name: 'UserLogin',
    component: () => import('@/views/user/LoginView.vue'),
    meta: { title: '授权登录' }
  },
  {
    path: '/user/terms',
    name: 'UserTerms',
    component: () => import('@/views/user/TermsView.vue'),
    meta: { title: '服务条款' }
  },
  // 管理员登录路由
  {
    path: '/admin/login',
    name: 'AdminLogin',
    component: () => import('@/views/admin/AdminLoginView.vue'),
    meta: { title: '管理员登录' }
  },
  {
    path: '/user',
    component: () => import('@/layouts/UserLayout.vue'),
    children: [
      {
        path: 'dashboard',
        name: 'UserDashboard',
        component: () => import('@/views/user/DashboardView.vue'),
        meta: { title: '首页总览', skeleton: 'dashboard' }
      },
      {
        path: 'tools',
        name: 'UserTools',
        component: () => import('@/views/user/ToolsView.vue'),
        meta: { title: '功能入口', skeleton: 'grid' }
      },
      {
        path: 'logs',
        name: 'UserLogs',
        component: () => import('@/views/user/LogsView.vue'),
        meta: { title: '个人日志与问题反馈', skeleton: 'table' }
      },
      {
        path: 'faq',
        name: 'UserFaq',
        component: () => import('@/views/user/FaqView.vue'),
        meta: { title: '常见问题', skeleton: 'default' }
      },
      {
        path: 'plans',
        name: 'UserPlans',
        component: () => import('@/views/user/PlansView.vue'),
        meta: { title: '套餐价格', skeleton: 'grid' }
      },
      {
        path: 'devices',
        name: 'UserDevices',
        component: () => import('@/views/user/DevicesView.vue'),
        meta: { title: '设备管理', skeleton: 'table' }
      },
      {
        path: 'ai-chat',
        name: 'UserAIChat',
        component: () => import('@/views/user/AIChatView.vue'),
        meta: { title: 'AI 客服', skeleton: 'default' }
      }
    ]
  },
  // 管理后台路由
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    redirect: '/admin/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'AdminDashboard',
        component: () => import('@/views/admin/DashboardView.vue'),
        meta: { title: '数据总览看板', skeleton: 'dashboard' }
      },
      {
        path: 'authcodes',
        name: 'AdminAuthCodes',
        component: () => import('@/views/admin/AuthCodesView.vue'),
        meta: { title: '授权码管理', skeleton: 'table' }
      },
      {
        path: 'orders',
        name: 'AdminOrders',
        component: () => import('@/views/admin/OrdersView.vue'),
        meta: { title: '订单与套餐权限', skeleton: 'table' }
      },
      {
        path: 'profit',
        name: 'AdminProfit',
        component: () => import('@/views/admin/ProfitView.vue'),
        meta: { title: '分润管理', skeleton: 'table' }
      },
      {
        path: 'settings',
        name: 'AdminSettings',
        component: () => import('@/views/admin/SettingsView.vue'),
        meta: { title: '系统设置', skeleton: 'default' }
      },
      {
        path: 'users',
        name: 'AdminUsers',
        component: () => import('@/views/admin/UsersView.vue'),
        meta: { title: '用户管理', skeleton: 'table' }
      },
      {
        path: 'feedback',
        name: 'AdminFeedback',
        component: () => import('@/views/admin/FeedbackView.vue'),
        meta: { title: '工单管理', skeleton: 'table' }
      },
      {
        path: 'knowledge',
        name: 'AdminKnowledge',
        component: () => import('@/views/admin/KnowledgeView.vue'),
        meta: { title: '知识库管理', skeleton: 'table' }
      },
      {
        path: 'ai-chat',
        name: 'AdminAIChat',
        component: () => import('@/views/admin/AIChatView.vue'),
        meta: { title: 'AI 客服管理', skeleton: 'default' }
      },
      {
        path: 'announcements',
        name: 'AdminAnnouncements',
        component: () => import('@/views/admin/AnnouncementsView.vue'),
        meta: { title: '公告管理', skeleton: 'table' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  }
})

// 路由守卫 - 使用 AuthService 统一管理
router.beforeEach((to, from, next) => {
  try {
    const isAuthenticated = authService.isAuthenticated()
    const isAdmin = authService.isAdmin()
    
    // 登录页不需要验证
    if (to.name === 'UserLogin' || to.name === 'AdminLogin' || to.name === 'UserTerms') {
      if (isAuthenticated) {
        // 已登录，根据角色跳转
        next({ name: isAdmin ? 'AdminDashboard' : 'UserDashboard' })
      } else {
        next()
      }
      return
    }
    
    // 管理后台需要管理员角色
    if (to.path.startsWith('/admin')) {
      if (!isAuthenticated) {
        next({ name: 'AdminLogin' })
        return
      }
      if (!isAdmin) {
        next({ name: 'UserDashboard' })
        return
      }
      next()
      return
    }
    
    // 用户端页面需要验证
    if (!isAuthenticated) {
      next({ name: 'UserLogin' })
      return
    }
    
    next()
  } catch (err) {
    console.error('Router guard error:', err)
    // 发生错误时，清除认证信息并跳转到登录页
    authService.clear()
    next({ name: 'UserLogin' })
  }
})

// 路由切换后自动调整窗口大小
router.afterEach((to) => {
  // 根据目标页面自动切换窗口模式
  if (to.path.startsWith('/admin')) {
    // 管理后台：宽屏看板模式
    window.electronAPI?.resizeWindow('admin-large')
  } else if (to.path.startsWith('/user') && to.name !== 'UserLogin' && to.name !== 'UserTerms') {
    // 用户端功能页面：窄屏伴侣模式
    window.electronAPI?.resizeWindow('trainee-mini')
  } else if (to.name === 'UserLogin' || to.name === 'AdminLogin') {
    // 登录页：默认窗口
    window.electronAPI?.resizeWindow('reset')
  }
})

export default router
