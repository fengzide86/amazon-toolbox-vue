<template>
  <aside class="sidebar-dark" aria-label="用户导航">
    <div class="sidebar-brand">
      <div class="brand-icon">
        <Zap :size="18" />
      </div>
      <span class="brand-text">工具箱</span>
    </div>
    <ul class="sidebar-nav">
      <li>
        <router-link to="/user/dashboard" active-class="active" :aria-current="isActive('/user/dashboard') ? 'page' : undefined">
          <LayoutDashboard :size="18" aria-hidden="true" />
          首页总览
        </router-link>
      </li>
      <li>
        <router-link to="/user/tools" active-class="active" :aria-current="isActive('/user/tools') ? 'page' : undefined">
          <Zap :size="18" aria-hidden="true" />
          功能入口
        </router-link>
      </li>
      <li>
        <router-link to="/user/logs" active-class="active" :aria-current="isActive('/user/logs') ? 'page' : undefined">
          <ClipboardList :size="18" aria-hidden="true" />
          个人日志
        </router-link>
      </li>
      <li>
        <router-link to="/user/faq" active-class="active" :aria-current="isActive('/user/faq') ? 'page' : undefined">
          <HelpCircle :size="18" aria-hidden="true" />
          常见问题
        </router-link>
      </li>
      <li>
        <router-link to="/user/plans" active-class="active" :aria-current="isActive('/user/plans') ? 'page' : undefined">
          <ShieldCheck :size="18" aria-hidden="true" />
          套餐价格
        </router-link>
      </li>
      <li>
        <router-link to="/user/devices" active-class="active" :aria-current="isActive('/user/devices') ? 'page' : undefined">
          <Monitor :size="18" aria-hidden="true" />
          设备管理
        </router-link>
      </li>
      <li>
        <router-link to="/user/ai-chat" active-class="active" :aria-current="isActive('/user/ai-chat') ? 'page' : undefined">
          <MessageCircle :size="18" aria-hidden="true" />
          AI 客服
        </router-link>
      </li>
    </ul>
    <div class="sidebar-footer">
      <button class="btn-logout" @click="handleLogout" aria-label="退出登录">
        <LogOut :size="18" aria-hidden="true" />
        退出登录
      </button>
    </div>
  </aside>
</template>

<script setup>
import { useRouter, useRoute } from 'vue-router'
import { Auth, showToast } from '@/utils'
import { Zap, LayoutDashboard, ClipboardList, HelpCircle, ShieldCheck, Monitor, MessageCircle, LogOut } from '@lucide/vue'

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