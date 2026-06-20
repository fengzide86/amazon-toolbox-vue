<template>
  <header class="studio-header">
    <div class="header-inner">
      <div class="header-left">
        <!-- 移动端汉堡菜单按钮 -->
        <button
          class="hamburger-btn"
          @click="$emit('toggle-sidebar')"
          aria-label="打开导航菜单"
        >
          <Menu :size="16" />
        </button>
        <div class="logo-icon">
          <Zap :size="16" />
        </div>
        <div class="header-title">
          <h1>赛训工具箱</h1>
        </div>
      </div>

      <!-- 平台切换器 -->
      <div class="platform-switcher" v-if="showPlatformSwitcher" data-testid="platform-switcher">
        <el-select
          v-model="currentPlatformModel"
          size="small"
          class="platform-select"
          @change="handlePlatformSelect"
        >
          <el-option
            v-for="platform in availablePlatformsForUser"
            :key="platform.key"
            :label="platform.short_name || platform.name"
            :value="platform.key"
            :disabled="!hasPermission(platform.key)"
          />
        </el-select>
      </div>

      <div class="header-right">
        <!-- SVIP 徽章（仅用户端显示） -->
        <span v-if="!isAdmin && isSvip" class="badge-svip">SVIP</span>

        <!-- 管理员标记 -->
        <span v-if="isAdmin" class="admin-badge">Owner</span>

        <!-- 头像下拉菜单 -->
        <el-dropdown trigger="click" placement="bottom-end" @command="handleCommand">
          <div class="avatar-wrapper" :title="isAdmin ? '管理员' : '用户'">
            <div class="avatar-circle">
              {{ isAdmin ? 'A' : 'U' }}
            </div>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="devices" :icon="Monitor">
                设备换绑
              </el-dropdown-item>
              <el-dropdown-item command="plans" :icon="PriceTag">
                续费中心
              </el-dropdown-item>
              <el-dropdown-item divided command="logout" :icon="SwitchButton" class="logout-item">
                退出系统
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Auth } from '@/utils'
import { usePlatformStore } from '@/stores/platform'
import { Monitor, PriceTag, SwitchButton } from '@element-plus/icons-vue'
import { Menu, Zap } from '@lucide/vue'

const props = defineProps({
  isAdmin: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['toggle-sidebar', 'platform-change'])

const router = useRouter()
const platformStore = usePlatformStore()

const showPlatformSwitcher = computed(() => platformStore.availablePlatforms.length > 0)

const currentPlatform = computed(() => platformStore.currentPlatform)
const adminPlatform = computed(() => platformStore.adminPlatform)

const currentPlatformModel = computed({
  get: () => props.isAdmin ? adminPlatform.value : currentPlatform.value,
  set: () => {} // handled by handlePlatformSelect
})

const availablePlatformsForUser = computed(() => {
  if (props.isAdmin) {
    return platformStore.availablePlatforms.filter(p => p.status === 'available')
  }
  const platformScope = getPlatformScope()
  return platformStore.getAvailablePlatformsForUser(platformScope)
})

// 检查用户是否有平台权限
const hasPermission = (platformKey) => {
  if (props.isAdmin) return true
  const platformScope = getPlatformScope()
  return platformStore.hasPlatformPermission(platformScope, platformKey)
}

// 获取平台权限
function getPlatformScope() {
  try {
    const scope = localStorage.getItem('toolbox_platform_scope')
    if (scope) {
      const parsed = JSON.parse(scope)
      if (Array.isArray(parsed)) return parsed.join(',')
    }
  } catch (e) {}
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

// 处理平台选择
const handlePlatformSelect = (platformKey) => {
  if (!hasPermission(platformKey)) return
  if (props.isAdmin) {
    platformStore.setAdminPlatform(platformKey)
  } else {
    platformStore.setPlatform(platformKey)
  }
  emit('platform-change', platformKey)
}

// 处理下拉菜单命令
const handleCommand = (command) => {
  if (command === 'logout') {
    handleLogout()
  } else if (command === 'devices') {
    if (props.isAdmin) {
      router.push('/admin/dashboard')
    } else {
      router.push('/user/devices')
    }
  } else if (command === 'plans') {
    if (props.isAdmin) {
      router.push('/admin/orders')
    } else {
      router.push('/user/plans')
    }
  }
}

// 检查是否 SVIP
const isSvip = computed(() => {
  try {
    const user = JSON.parse(localStorage.getItem('toolbox_user') || '{}')
    return user.plan_name && user.plan_name.includes('冲刺')
  } catch (e) {
    return false
  }
})

function handleLogout() {
  Auth.clear()
  localStorage.removeItem('toolbox_role')
  localStorage.removeItem('toolbox_current_platform')
  localStorage.removeItem('toolbox_admin_platform')
  router.push('/user/login')
}

onMounted(() => {
  platformStore.loadPlatforms()
})
</script>

<style scoped>
.studio-header {
  height: var(--header-height);
  background: var(--studio-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(20px);
}

.header-inner {
  max-width: 100%;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 汉堡菜单按钮 */
.hamburger-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
  color: var(--color-muted);
  flex-shrink: 0;
}

.hamburger-btn svg {
  width: 16px;
  height: 16px;
}

.hamburger-btn:hover {
  background: var(--color-border-light);
  color: var(--color-primary);
}

/* Logo */
.logo-icon {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, var(--studio-accent), var(--studio-accent-light));
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo-icon svg {
  width: 16px;
  height: 16px;
  color: white;
}

.header-title h1 {
  font-family: var(--font-heading);
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--studio-text-main);
  white-space: nowrap;
}

/* 平台切换器 */
.platform-switcher {
  display: flex;
  align-items: center;
}

.platform-select {
  width: 140px;
}

:deep(.platform-select .el-input__wrapper) {
  box-shadow: none !important;
  background: var(--color-border-light);
  border-radius: 8px;
  padding: 0 8px;
}

:deep(.platform-select .el-input__inner) {
  font-size: 13px;
  font-weight: 500;
  color: var(--studio-text-main);
}

/* 右侧区域 */
.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* SVIP 徽章 */
.badge-svip {
  font-size: 10px;
  background: linear-gradient(135deg, #F59E0B, #D97706);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

/* 管理员标记 */
.admin-badge {
  font-size: 10px;
  background: rgba(79, 70, 229, 0.1);
  border: 1px solid rgba(79, 70, 229, 0.2);
  color: var(--studio-accent);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
}

/* 头像 */
.avatar-wrapper {
  cursor: pointer;
}

.avatar-circle {
  width: 28px;
  height: 28px;
  background: var(--color-border-light);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--studio-text-muted);
  transition: all var(--transition);
}

.avatar-circle:hover {
  background: var(--color-border);
  color: var(--studio-text-main);
}

/* 下拉菜单退出项 */
.logout-item {
  color: var(--studio-danger) !important;
}

/* 移动端显示汉堡菜单 */
@media (max-width: 1024px) {
  .hamburger-btn {
    display: flex;
  }
}

@media (max-width: 640px) {
  .platform-switcher {
    display: none;
  }
  .header-title h1 {
    font-size: 0.85rem;
  }
}
</style>