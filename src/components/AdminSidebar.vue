<template>
  <aside class="studio-admin-sidebar" aria-label="管理员导航">
    <!-- 品牌区 -->
    <div class="sidebar-brand-zone">
      <div class="brand-badge">管</div>
      <span class="brand-text">运营控制中心<small>{{ roleLabel }}</small></span>
    </div>

    <!-- 导航菜单 -->
    <nav class="sidebar-menu-nav">
      <router-link to="/admin/dashboard" class="menu-nav-item" active-class="is-active">
        <LayoutDashboard :size="14" class="menu-icon" />
        <span class="menu-label">行动中心</span>
      </router-link>
      <router-link to="/admin/authcodes" class="menu-nav-item" active-class="is-active">
        <Key :size="14" class="menu-icon" />
        <span class="menu-label">授权码管理</span>
      </router-link>
      <router-link v-if="role !== 'support'" to="/admin/business-access" class="menu-nav-item" active-class="is-active">
        <BriefcaseBusiness :size="14" class="menu-icon" />
        <span class="menu-label">专业工作台</span>
      </router-link>
      <router-link to="/admin/orders" class="menu-nav-item" active-class="is-active">
        <Receipt :size="14" class="menu-icon" />
        <span class="menu-label">订单与套餐</span>
      </router-link>
      <router-link v-if="can('profit.read')" to="/admin/profit" class="menu-nav-item" active-class="is-active">
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
      <router-link v-if="can('rules.write')" to="/admin/ai-chat" class="menu-nav-item" active-class="is-active">
        <MessageSquare :size="14" class="menu-icon" />
        <span class="menu-label">客服规则管理</span>
      </router-link>
      <router-link to="/admin/announcements" class="menu-nav-item" active-class="is-active">
        <Megaphone :size="14" class="menu-icon" />
        <span class="menu-label">公告管理</span>
      </router-link>
      <router-link v-if="can('updates.manage')" to="/admin/updates" class="menu-nav-item" active-class="is-active">
        <PackageCheck :size="14" class="menu-icon" />
        <span class="menu-label">应用更新</span>
      </router-link>
      <router-link v-if="can('settings.manage')" to="/admin/settings" class="menu-nav-item" active-class="is-active">
        <Settings :size="14" class="menu-icon" />
        <span class="menu-label">系统设置</span>
      </router-link>
      <router-link v-if="can('staff.manage')" to="/admin/staff-accounts" class="menu-nav-item" active-class="is-active">
        <ShieldUser :size="14" class="menu-icon" />
        <span class="menu-label">后台账号管理</span>
      </router-link>
    </nav>

  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { authService } from '@/utils/auth'
import { hasStaffPermission, staffRoleLabel, type StaffPermission } from '@/features/auth/permissions'
import {
  LayoutDashboard, Key, BriefcaseBusiness, Receipt, Percent, Users, Wrench,
  BookOpen, MessageSquare, Megaphone, PackageCheck, Settings, ShieldUser
} from '@lucide/vue'

const role = computed(() => authService.getRole())
const roleLabel = computed(() => staffRoleLabel(role.value))
const can = (permission: StaffPermission): boolean => hasStaffPermission(role.value, permission)
</script>

<style scoped>
.studio-admin-sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  background: rgba(252, 252, 253, .97);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  user-select: none;
  flex-shrink: 0;
  position: fixed;
  top: 0;
  left: 0;
  z-index: var(--z-sidebar);
  backdrop-filter: blur(18px);
}

.sidebar-brand-zone {
  height: var(--header-height);
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 11px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.brand-badge {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  background: var(--color-primary);
  color: white;
  font-size:var(--type-meta);
  font-weight: 700;
  border-radius: 9px;
  box-shadow: 0 6px 14px rgba(45, 95, 202, .18);
}

.brand-text { display:grid; gap:1px; color: var(--color-text); font-size: 13px; font-weight: 700; letter-spacing: -.01em; }
.brand-text small { color: var(--color-text-tertiary); font-size: var(--type-micro); font-weight: 700; letter-spacing: .08em; }

.sidebar-menu-nav {
  flex-grow: 1;
  padding: 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
}

.menu-nav-item {
  min-height: 38px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 10px;
  border-radius: 9px;
  cursor: pointer;
  position: relative;
  transition: color var(--motion-fast), background var(--motion-fast), transform var(--motion-press);
  text-decoration: none;
  border: none;
  background: transparent;
  width: 100%;
  box-sizing: border-box;
}

.menu-icon { width: 15px; height: 15px; color: var(--color-text-tertiary); stroke-width: 1.8px; transition: color var(--motion-fast); flex-shrink: 0; }

.menu-label { color: var(--color-text-secondary); font-size:var(--type-meta); font-weight: 600; transition: color var(--motion-fast); white-space: nowrap; }

.menu-nav-item:hover { background: #f2f4f7; }

.menu-nav-item:hover .menu-icon,
.menu-nav-item:hover .menu-label { color: var(--color-text); }

.menu-nav-item.is-active { background: var(--color-primary-soft); }

.menu-nav-item.is-active .menu-icon,
.menu-nav-item.is-active .menu-label { color: var(--color-primary); font-weight: 700; }

.menu-nav-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 3px;
  background: var(--color-primary);
  border-radius: 0 3px 3px 0;
}

@media (max-width: 1024px) {
  .studio-admin-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(280px, 86vw);
    z-index: var(--z-sidebar);
    box-shadow: var(--shadow-overlay);
    transform: translateX(-100%);
    transition: transform var(--motion-slow) var(--ease-emphasized);
  }

  .studio-admin-sidebar.mobile-open {
    transform: translateX(0);
  }
}
</style>
