import { createRouter, createWebHistory, type RouterHistory, type RouteRecordRaw } from 'vue-router'

export const marketingRoutes: RouteRecordRaw[] = [
  {
    path: '/', name: 'Landing', component: () => import('@/views/LandingView.vue'),
    props: { marketingOnly: true }, meta: { title: '跨境电商赛训效率平台' },
  },
  {
    path: '/terms', alias: '/user/terms', name: 'MarketingTerms', component: () => import('./MarketingTermsView.vue'),
    meta: { title: '服务条款' },
  },
  {
    path: '/:pathMatch(.*)*', name: 'MarketingNotFound', component: () => import('./MarketingNotFound.vue'),
    meta: { title: '页面未找到' },
  },
]

export function createMarketingRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes: marketingRoutes,
    scrollBehavior(to, _from, savedPosition) {
      if (savedPosition) return savedPosition
      if (to.hash) return { el: to.hash, top: 88 }
      return { top: 0 }
    },
  })
  router.afterEach(to => {
    document.title = `${String(to.meta.title || '官网')} · 课赛通 KST`
    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('[data-route-focus]')
      if (!target) return
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    })
  })
  return router
}
