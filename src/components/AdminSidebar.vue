<template>
  <aside class="studio-admin-sidebar" aria-label="管理员导航">
    <!-- 品牌区 -->
    <div class="sidebar-brand-zone">
      <div class="brand-badge">AMZ</div>
      <span class="brand-text">控制中心</span>
    </div>

    <!-- 导航菜单 -->
    <nav class="sidebar-menu-nav">
      <router-link to="/admin/dashboard" class="menu-nav-item" active-class="is-active">
        <LayoutDashboard :size="14" class="menu-icon" />
        <span class="menu-label">数据总览</span>
      </router-link>
      <router-link to="/admin/authcodes" class="menu-nav-item" active-class="is-active">
        <Key :size="14" class="menu-icon" />
        <span class="menu-label">授权码管理</span>
      </router-link>
      <router-link to="/admin/orders" class="menu-nav-item" active-class="is-active">
        <Receipt :size="14" class="menu-icon" />
        <span class="menu-label">订单与套餐</span>
      </router-link>
      <router-link to="/admin/profit" class="menu-nav-item" active-class="is-active">
        <Percent :size="14" class="menu-icon" />
        <span class="menu-label">分润管理</span>
      </router-link>
      <router-link to="/admin/users" class="menu-nav-item" active-class="is-active">
        <Users :size="14" class="menu-icon" />
        <span class="menu-label">用户管理</span>
      </router-link>
      <router-link to="/admin/feedback" class="menu-nav-item" active-class="is-active">
        <Wrench :size="14" class="menu-icon" />
        <span class="menu-label">工单管理</span>
      </router-link>
      <router-link to="/admin/knowledge" class="menu-nav-item" active-class="is-active">
        <BookOpen :size="14" class="menu-icon" />
        <span class="menu-label">知识库管理</span>
      </router-link>
      <router-link to="/admin/ai-chat" class="menu-nav-item" active-class="is-active">
        <MessageSquare :size="14" class="menu-icon" />
        <span class="menu-label">AI 客服管理</span>
      </router-link>
      <router-link to="/admin/announcements" class="menu-nav-item" active-class="is-active">
        <Megaphone :size="14" class="menu-icon" />
        <span class="menu-label">公告管理</span>
      </router-link>
      <router-link to="/admin/settings" class="menu-nav-item" active-class="is-active">
        <Settings :size="14" class="menu-icon" />
        <span class="menu-label">系统设置</span>
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
import { useRouter } from 'vue-router'
import { Auth, showToast } from '@/utils'
import {
  LayoutDashboard, Key, Receipt, Percent, Users, Wrench,
  BookOpen, MessageSquare, Megaphone, Settings, LogOut
} from '@lucide/vue'

const router = useRouter()

function handleLogout() {
  if (!confirm('确定要退出登录吗？')) return
  Auth.clear()
  localStorage.removeItem('toolbox_role')
  localStorage.removeItem('toolbox_user')
  showToast('已退出登录', 'success')
  router.push('/admin/login')
}
</script>

<style scoped>
/* 全高骨架侧边栏 */
.studio-admin-sidebar {
  width: var(--sidebar-width, 200px);
  height: 100vh;
  background-color: var(--studio-frame, #0F172A);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  user-select: none;
  flex-shrink: 0;
}

/* 品牌区 */
.sidebar-brand-zone {
  height: var(--header-height, 48px);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}

.brand-badge {
  background: var(--studio-accent, #4F46E5);
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}

  .brand-text {
    font-size: 12px;
    font-weight: 600;
    color: var(--studio-text-on-dark-muted, #94A3B8);
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
    color: var(--studio-icon-on-dark, #94A3B8);
    stroke-width: 1.75px;
    transition: color 0.2s;
    flex-shrink: 0;
  }

  .menu-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--studio-text-on-dark-muted, #94A3B8);
    transition: color 0.2s;
    white-space: nowrap;
  }

/* Hover */
.menu-nav-item:hover {
  background-color: rgba(255, 255, 255, 0.04);
}

  .menu-nav-item:hover .menu-icon,
  .menu-nav-item:hover .menu-label {
    color: var(--studio-text-on-dark, #F8FAFC);
  }

/* Active - 3px 左侧高亮蓝条 */
  .menu-nav-item.is-active {
    background-color: rgba(14, 165, 233, 0.15);
  }

  .menu-nav-item.is-active .menu-icon,
  .menu-nav-item.is-active .menu-label {
    color: var(--studio-text-on-dark, #FFFFFF);
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
  border-top: 1px solid rgba(255, 255, 255, 0.04);
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
  .studio-admin-sidebar {
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

  .studio-admin-sidebar.mobile-open {
    transform: translateX(0);
  }
}
</style>