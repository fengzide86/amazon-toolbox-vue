import { createRouter, createWebHashHistory } from 'vue-router'

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
        meta: { title: '首页总览' }
      },
      {
        path: 'tools',
        name: 'UserTools',
        component: () => import('@/views/user/ToolsView.vue'),
        meta: { title: '功能入口' }
      },
      {
        path: 'logs',
        name: 'UserLogs',
        component: () => import('@/views/user/LogsView.vue'),
        meta: { title: '个人日志与问题反馈' }
      },
      {
        path: 'faq',
        name: 'UserFaq',
        component: () => import('@/views/user/FaqView.vue'),
        meta: { title: '常见问题' }
      },
      {
        path: 'plans',
        name: 'UserPlans',
        component: () => import('@/views/user/PlansView.vue'),
        meta: { title: '套餐价格' }
      },
      {
        path: 'devices',
        name: 'UserDevices',
        component: () => import('@/views/user/DevicesView.vue'),
        meta: { title: '设备管理' }
      },
      {
        path: 'ai-chat',
        name: 'UserAIChat',
        component: () => import('@/views/user/AIChatView.vue'),
        meta: { title: 'AI 客服' }
      }
    ]
  },
  // 管理后台路由
  {
    path: '/admin',
    redirect: '/admin/dashboard'
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    children: [
      {
        path: 'dashboard',
        name: 'AdminDashboard',
        component: () => import('@/views/admin/DashboardView.vue'),
        meta: { title: '数据总览看板' }
      },
      {
        path: 'authcodes',
        name: 'AdminAuthCodes',
        component: () => import('@/views/admin/AuthCodesView.vue'),
        meta: { title: '授权码管理' }
      },
      {
        path: 'orders',
        name: 'AdminOrders',
        component: () => import('@/views/admin/OrdersView.vue'),
        meta: { title: '订单与套餐权限' }
      },
      {
        path: 'profit',
        name: 'AdminProfit',
        component: () => import('@/views/admin/ProfitView.vue'),
        meta: { title: '分润管理' }
      },
      {
        path: 'settings',
        name: 'AdminSettings',
        component: () => import('@/views/admin/SettingsView.vue'),
        meta: { title: '系统设置' }
      },
      {
        path: 'users',
        name: 'AdminUsers',
        component: () => import('@/views/admin/UsersView.vue'),
        meta: { title: '用户管理' }
      },
      {
        path: 'feedback',
        name: 'AdminFeedback',
        component: () => import('@/views/admin/FeedbackView.vue'),
        meta: { title: '工单管理' }
      },
      {
        path: 'knowledge',
        name: 'AdminKnowledge',
        component: () => import('@/views/admin/KnowledgeView.vue'),
        meta: { title: '知识库管理' }
      },
      {
        path: 'ai-chat',
        name: 'AdminAIChat',
        component: () => import('@/views/admin/AIChatView.vue'),
        meta: { title: 'AI 客服管理' }
      },
      {
        path: 'announcements',
        name: 'AdminAnnouncements',
        component: () => import('@/views/admin/AnnouncementsView.vue'),
        meta: { title: '公告管理' }
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

// 路由守卫 - 检查登录状态
router.beforeEach((to, from, next) => {
  try {
    const auth = localStorage.getItem('toolbox_auth')
    const role = localStorage.getItem('toolbox_role') || 'user'
    
    // 登录页不需要验证
    if (to.name === 'UserLogin' || to.name === 'AdminLogin' || to.name === 'UserTerms') {
      if (auth) {
        // 已登录，根据角色跳转
        next({ name: role === 'admin' ? 'AdminDashboard' : 'UserDashboard' })
      } else {
        next()
      }
      return
    }
    
    // 管理后台需要管理员角色
    if (to.path.startsWith('/admin')) {
      if (!auth) {
        next({ name: 'AdminLogin' })
        return
      }
      if (role !== 'admin') {
        next({ name: 'UserDashboard' })
        return
      }
      next()
      return
    }
    
    // 用户端页面需要验证
    if (!auth) {
      next({ name: 'UserLogin' })
      return
    }
    
    next()
  } catch (err) {
    console.error('Router guard error:', err)
    // 发生错误时，尝试清除可能损坏的数据并跳转到登录页
    try {
      localStorage.removeItem('toolbox_auth')
      localStorage.removeItem('toolbox_role')
      localStorage.removeItem('toolbox_user')
    } catch (e) {
      // 忽略清理错误
    }
    next({ name: 'UserLogin' })
  }
})

export default router