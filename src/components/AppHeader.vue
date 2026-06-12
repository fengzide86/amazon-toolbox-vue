<template>
  <header class="header">
    <div class="header-inner">
      <div class="header-left">
        <!-- 移动端汉堡菜单按钮 -->
        <button
          class="hamburger-btn"
          @click="$emit('toggle-sidebar')"
          aria-label="打开导航菜单"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
        <div class="logo-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <div class="header-title">
          <h1>亚马逊赛训效率工具箱</h1>
          <p>{{ roleText }}</p>
        </div>
      </div>
      <div class="header-right">
        <span v-if="isAdmin" class="admin-badge">Owner</span>
        <span class="admin-name">{{ isAdmin ? '管理员' : '用户' }}</span>
        <button class="header-logout-btn" @click="handleLogout" title="退出登录">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Auth } from '@/utils'

const props = defineProps({
  isAdmin: {
    type: Boolean,
    default: false
  }
})

defineEmits(['toggle-sidebar'])

const router = useRouter()

const roleText = computed(() => props.isAdmin ? '管理后台' : '用户中心')

function handleLogout() {
  Auth.clear()
  localStorage.removeItem('toolbox_role')
  router.push('/user/login')
}
</script>

<style scoped>
.header-inner {
  max-width: var(--content-max-width);
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* 汉堡菜单按钮 */
.hamburger-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition);
  color: var(--color-muted);
  flex-shrink: 0;
}

.hamburger-btn svg {
  width: 20px;
  height: 20px;
}

.hamburger-btn:hover {
  background: var(--color-border-light);
  border-color: var(--color-border);
  color: var(--color-primary);
}

/* 用户信息区域 */
.user-info {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.875rem;
  background: var(--color-border-light);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  color: var(--color-primary);
  font-weight: 500;
}

.user-avatar {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-light));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
}

/* 退出按钮 */
.header-logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
  color: var(--color-muted);
}

.header-logout-btn svg {
  width: 18px;
  height: 18px;
}

.header-logout-btn:hover {
  background: rgba(220, 38, 38, 0.06);
  border-color: rgba(220, 38, 38, 0.2);
  color: var(--color-destructive);
}

/* 移动端显示汉堡菜单 */
@media (max-width: 1024px) {
  .hamburger-btn {
    display: flex;
  }
}
</style>
