<template>
  <aside class="sidebar-dark" aria-label="用户导航">
    <div class="sidebar-brand">
      <div class="brand-icon">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
        </svg>
      </div>
      <span class="brand-text">工具箱</span>
    </div>
    <ul class="sidebar-nav">
      <li>
        <router-link to="/user/dashboard" active-class="active" :aria-current="isActive('/user/dashboard') ? 'page' : undefined">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
          首页总览
        </router-link>
      </li>
      <li>
        <router-link to="/user/tools" active-class="active" :aria-current="isActive('/user/tools') ? 'page' : undefined">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          功能入口
        </router-link>
      </li>
      <li>
        <router-link to="/user/logs" active-class="active" :aria-current="isActive('/user/logs') ? 'page' : undefined">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
          </svg>
          个人日志
        </router-link>
      </li>
      <li>
        <router-link to="/user/faq" active-class="active" :aria-current="isActive('/user/faq') ? 'page' : undefined">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          常见问题
        </router-link>
      </li>
      <li>
        <router-link to="/user/plans" active-class="active" :aria-current="isActive('/user/plans') ? 'page' : undefined">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
          套餐价格
        </router-link>
      </li>
      <li>
        <router-link to="/user/devices" active-class="active" :aria-current="isActive('/user/devices') ? 'page' : undefined">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          设备管理
        </router-link>
      </li>
      <li>
        <router-link to="/user/ai-chat" active-class="active" :aria-current="isActive('/user/ai-chat') ? 'page' : undefined">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
          </svg>
          AI 客服
        </router-link>
      </li>
    </ul>
    <div class="sidebar-footer">
      <button class="btn-logout" @click="handleLogout" aria-label="退出登录">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
        </svg>
        退出登录
      </button>
    </div>
  </aside>
</template>

<script setup>
import { useRouter, useRoute } from 'vue-router'
import { Auth, showToast } from '@/utils'

const router = useRouter()
const route = useRoute()

function isActive(path) {
  return route.path === path
}

function handleLogout() {
  if (!confirm('确定要退出登录吗？')) return
  Auth.clear()
  localStorage.removeItem('toolbox_role')
  localStorage.removeItem('toolbox_user')
  showToast('已退出登录', 'success')
  router.push('/user/login')
}
</script>

<style scoped>
.sidebar-dark {
  position: sticky;
  top: calc(var(--header-height) + var(--spacing-lg));
  height: fit-content;
  max-height: calc(100vh - var(--header-height) - var(--spacing-3xl));
  display: flex;
  flex-direction: column;
  background: #0F172A;
  border-radius: var(--radius-lg);
  padding: var(--spacing-sm);
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

/* 品牌区域 */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 0.75rem 0.5rem;
  margin-bottom: 0.25rem;
}

.brand-icon {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #4F46E5, #818CF8);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brand-icon svg {
  width: 16px;
  height: 16px;
  color: white;
}

.brand-text {
  font-size: 0.8rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.05em;
}

/* 导航菜单 */
.sidebar-nav {
  list-style: none;
  flex: 1;
}

.sidebar-nav li {
  margin-bottom: 2px;
}

.sidebar-nav a {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.6rem 0.75rem;
  border-radius: var(--radius-md);
  color: rgba(255, 255, 255, 0.5);
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 500;
  transition: all var(--transition);
  font-family: var(--font-heading);
  cursor: pointer;
}

.sidebar-nav a:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
}

.sidebar-nav a.active {
  background: rgba(79, 70, 229, 0.25);
  color: white;
  font-weight: 600;
}

/* 左侧指示条 */
.sidebar-nav a.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 55%;
  background: var(--studio-accent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.sidebar-nav a svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* 底部退出按钮 */
.sidebar-footer {
  margin-top: auto;
  padding: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.btn-logout {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition);
}

.btn-logout:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #F87171;
}

.btn-logout svg {
  width: 14px;
  height: 14px;
}

/* 移动端适配 */
@media (max-width: 1024px) {
  .sidebar-dark {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 220px;
    z-index: 999;
    border-radius: 0;
    max-height: 100vh;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3);
  }
}
</style>