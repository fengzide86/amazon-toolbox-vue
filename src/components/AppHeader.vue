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
          <h1>跨境电商赛训工具箱</h1>
          <p>{{ roleText }}</p>
        </div>
      </div>
      
      <!-- 平台切换器 -->
      <div class="platform-switcher" v-if="showPlatformSwitcher" data-testid="platform-switcher">
        <span class="platform-label">{{ isAdmin ? '管理平台：' : '平台：' }}</span>
        <div class="platform-options">
          <button
            v-if="isAdmin"
            class="platform-btn"
            :class="{ active: adminPlatform === 'all' }"
            @click="setAdminPlatform('all')"
          >
            全部平台
          </button>
          <button
            v-for="platform in availablePlatformsForUser"
            :key="platform.key"
            class="platform-btn"
            :class="{ 
              active: isAdmin ? adminPlatform === platform.key : currentPlatform === platform.key,
              disabled: !hasPermission(platform.key)
            }"
            :disabled="!hasPermission(platform.key)"
            @click="handlePlatformChange(platform.key)"
            :title="!hasPermission(platform.key) ? '当前授权暂未包含该平台，如需使用请升级授权。' : ''"
          >
            {{ platform.short_name || platform.name }}
          </button>
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
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Auth } from '@/utils'
import { usePlatformStore } from '@/stores/platform'

const props = defineProps({
  isAdmin: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['toggle-sidebar', 'platform-change'])

const router = useRouter()
const platformStore = usePlatformStore()

const roleText = computed(() => props.isAdmin ? '管理后台' : '用户中心')
const showPlatformSwitcher = computed(() => platformStore.availablePlatforms.length > 0)

const currentPlatform = computed(() => platformStore.currentPlatform)
const adminPlatform = computed(() => platformStore.adminPlatform)
const availablePlatformsForUser = computed(() => {
  // 获取用户授权的平台权限
  const platformScope = getPlatformScope()
  return platformStore.getAvailablePlatformsForUser(platformScope)
})

// 检查用户是否有平台权限
const hasPermission = (platformKey) => {
  if (props.isAdmin) return true
  const platformScope = getPlatformScope()
  return platformStore.hasPlatformPermission(platformScope, platformKey)
}

// 获取平台权限（支持数组和字符串格式）
function getPlatformScope() {
  // 优先从登录时存储的 JSON 数组读取
  try {
    const scope = localStorage.getItem('toolbox_platform_scope')
    if (scope) {
      const parsed = JSON.parse(scope)
      if (Array.isArray(parsed)) return parsed.join(',')
    }
  } catch (e) {}
  // 兼容旧格式：从 toolbox_auth 读取
  try {
    const authData = JSON.parse(localStorage.getItem('toolbox_auth') || '{}')
    if (authData.platform_scope) {
      return Array.isArray(authData.platform_scope)
        ? authData.platform_scope.join(',')
        : authData.platform_scope
    }
  } catch (e) {}
  return null
}

// 处理平台切换
const handlePlatformChange = (platformKey) => {
  if (!hasPermission(platformKey)) return
  
  if (props.isAdmin) {
    platformStore.setAdminPlatform(platformKey)
  } else {
    platformStore.setPlatform(platformKey)
  }
  // 触发平台切换事件，通知父组件刷新数据
  emit('platform-change', platformKey)
}

const setAdminPlatform = (platformKey) => {
  platformStore.setAdminPlatform(platformKey)
  emit('platform-change', platformKey)
}

function handleLogout() {
  Auth.clear()
  localStorage.removeItem('toolbox_role')
  localStorage.removeItem('toolbox_current_platform')
  localStorage.removeItem('toolbox_admin_platform')
  router.push('/user/login')
}

onMounted(() => {
  // 加载平台配置
  platformStore.loadPlatforms()
})
</script>

<style scoped>
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
  background: rgba(var(--color-destructive-rgb, 239, 68, 68), 0.06);
  border-color: rgba(var(--color-destructive-rgb, 239, 68, 68), 0.2);
  color: var(--color-destructive);
}

/* 平台切换器 */
.platform-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 16px;
}

.platform-label {
  font-size: 13px;
  color: var(--color-muted);
  white-space: nowrap;
}

.platform-options {
  display: flex;
  gap: 4px;
  background: #F1F5F9;
  border-radius: var(--radius-md);
  padding: 2px;
}

.platform-btn {
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-muted);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
}

.platform-btn:hover:not(.disabled) {
  color: var(--color-primary);
  background: white;
}

.platform-btn.active {
  color: white;
  background: var(--color-accent);
  box-shadow: 0 1px 2px rgba(99, 102, 241, 0.3);
  font-weight: 600;
}

.platform-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 移动端显示汉堡菜单 */
@media (max-width: 1024px) {
  .hamburger-btn {
    display: flex;
  }
  
  .platform-switcher {
    margin: 0 8px;
  }
  
  .platform-label {
    display: none;
  }
  
  .platform-btn {
    padding: 4px 8px;
    font-size: 12px;
  }
}

@media (max-width: 640px) {
  .platform-switcher {
    display: none;
  }
}
</style>
