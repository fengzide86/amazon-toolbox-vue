<template>
  <aside class="studio-user-sidebar" aria-label="用户导航">
    <!-- 品牌区 -->
    <div class="sidebar-brand-zone">
      <div class="brand-badge">
        <Zap :size="12" />
      </div>
      <span class="brand-text">工具箱</span>
    </div>

    <!-- 导航菜单 -->
    <nav class="sidebar-menu-nav">
      <router-link to="/user/dashboard" class="menu-nav-item" active-class="is-active" :aria-current="isActive('/user/dashboard') ? 'page' : undefined" @mouseenter="prefetchRoute('/user/dashboard')">
        <LayoutDashboard :size="14" class="menu-icon" aria-hidden="true" />
        <span class="menu-label">首页总览</span>
      </router-link>
      <router-link to="/user/tools" class="menu-nav-item" active-class="is-active" :aria-current="isActive('/user/tools') ? 'page' : undefined" @mouseenter="prefetchRoute('/user/tools')">
        <Zap :size="14" class="menu-icon" aria-hidden="true" />
        <span class="menu-label">功能入口</span>
      </router-link>
      <router-link to="/user/logs" class="menu-nav-item" active-class="is-active" :aria-current="isActive('/user/logs') ? 'page' : undefined" @mouseenter="prefetchRoute('/user/logs')">
        <ClipboardList :size="14" class="menu-icon" aria-hidden="true" />
        <span class="menu-label">个人日志</span>
      </router-link>
      <router-link to="/user/faq" class="menu-nav-item" active-class="is-active" :aria-current="isActive('/user/faq') ? 'page' : undefined" @mouseenter="prefetchRoute('/user/faq')">
        <HelpCircle :size="14" class="menu-icon" aria-hidden="true" />
        <span class="menu-label">常见问题</span>
      </router-link>
      <router-link to="/user/plans" class="menu-nav-item" active-class="is-active" :aria-current="isActive('/user/plans') ? 'page' : undefined" @mouseenter="prefetchRoute('/user/plans')">
        <ShieldCheck :size="14" class="menu-icon" aria-hidden="true" />
        <span class="menu-label">套餐价格</span>
      </router-link>
      <router-link to="/user/devices" class="menu-nav-item" active-class="is-active" :aria-current="isActive('/user/devices') ? 'page' : undefined" @mouseenter="prefetchRoute('/user/devices')">
        <Monitor :size="14" class="menu-icon" aria-hidden="true" />
        <span class="menu-label">设备管理</span>
      </router-link>
      <router-link to="/user/ai-chat" class="menu-nav-item" active-class="is-active" :aria-current="isActive('/user/ai-chat') ? 'page' : undefined" @mouseenter="prefetchRoute('/user/ai-chat')">
        <MessageCircle :size="14" class="menu-icon" aria-hidden="true" />
        <span class="menu-label">AI 客服</span>
      </router-link>
    </nav>

    <!-- 底部退出 -->
    <div class="sidebar-footer-zone">
      <button class="menu-nav-item logout-item" @click="handleLogout" aria-label="退出登录">
        <LogOut :size="14" class="menu-icon" />
        <span class="menu-label">退出登录</span>
      </button>
    </div>
  </aside>
</template>

<script setup>
import { useRouter, useRoute } from 'vue-router'
import { Auth, showToast } from '@/utils'
import {
  Zap, LayoutDashboard, ClipboardList, HelpCircle,
  ShieldCheck, Monitor, MessageCircle, LogOut
} from '@lucide/vue'

const router = useRouter()
const route = useRoute()

function isActive(path) {
  return route.path === path
}

function prefetchRoute(path) {
  import(/* @vite-ignore */ `@/views${path}.vue`)
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
/* 全高骨架侧边栏 - 桌面端固定悬浮 */
.studio-user-sidebar {
  width: var(--sidebar-width, 200px);
  height: 100vh;
  background-color: var(--studio-frame, #0F172A);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  user-select: none;
  flex-shrink: 0;
  /* 桌面端固定悬浮在左侧 */
  position: fixed;
  top: 0;
  left: 0;
  z-index: 99;
}

/* 品牌区 */
.sidebar-brand-zone {
  height: var(--header-height, 48px);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 8px;
  border-bottom: 1px solid var(--studio-accent-hover-bg);
  flex-shrink: 0;
}

.brand-badge {
  background: linear-gradient(135deg, var(--studio-accent, #4F46E5), var(--studio-accent-light, #818CF8));
  width: 20px;
  height: 20px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brand-badge svg {
  width: 12px;
  height: 12px;
  color: white;
}

.brand-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--studio-text-on-dark-muted);
  letter-spacing: 0.5px;
}

/* 导航菜单 */
.sidebar-menu-nav {
  flex-grow: 1;
  padding: 14px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

/* 菜单项 */
.menu-nav-item {
  height: 34px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 10px;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  text-decoration: none;
  border: none;
  background: transparent;
  width: 100%;
  box-sizing: border-box;
}

.menu-icon {
  width: 14px;
  height: 14px;
  color: var(--studio-icon-on-dark);
  stroke-width: 1.75px;
  transition: all var(--transition);
  flex-shrink: 0;
}

.menu-nav-item:hover .menu-icon {
  transform: scale(1.1);
  color: var(--studio-text-on-dark);
}

.menu-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--studio-text-on-dark-muted);
  transition: color 0.2s;
  white-space: nowrap;
}

/* Hover */
.menu-nav-item:hover {
  background-color: var(--studio-accent-hover-bg);
}

.menu-nav-item:hover .menu-icon,
.menu-nav-item:hover .menu-label {
  color: var(--studio-text-on-dark);
}

/* Active - 3px 左侧高亮蓝条 */
.menu-nav-item.is-active {
  background-color: var(--studio-accent-active);
}

.menu-nav-item.is-active .menu-icon,
.menu-nav-item.is-active .menu-label {
  color: var(--studio-text-on-dark);
  font-weight: 600;
}

.menu-nav-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  background-color: var(--studio-accent, #4F46E5);
  border-radius: 0 2px 2px 0;
}

/* 底部退出区 */
.sidebar-footer-zone {
  padding: 8px;
  border-top: 1px solid var(--studio-accent-hover-bg);
  flex-shrink: 0;
}

.logout-item:hover {
  background-color: rgba(239, 68, 68, 0.1) !important;
}

.logout-item:hover .menu-icon,
.logout-item:hover .menu-label {
  color: var(--studio-danger, #EF4444) !important;
}

/* 移动端适配 */
@media (max-width: 1024px) {
  .studio-user-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 220px;
    z-index: 999;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3);
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .studio-user-sidebar.mobile-open {
    transform: translateX(0);
  }
}
</style>