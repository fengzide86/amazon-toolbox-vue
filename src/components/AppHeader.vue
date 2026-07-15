<template>
  <header class="studio-header">
    <div class="header-inner">
      <div class="header-left">
        <!-- 移动端汉堡菜单按钮 -->
        <button
          class="hamburger-btn"
          @click="$emit('toggle-sidebar')"
          aria-label="打开导航菜单"
          title="打开导航菜单"
        >
          <Menu :size="16" />
        </button>
        <router-link :to="homePath" class="logo-link">
          <div class="logo-icon">
            <Zap :size="16" />
          </div>
          <div class="header-title">
            <h1>{{ isAdmin ? '运营控制中心' : isBusiness ? '专业批量工作台' : '自动化工具箱' }}</h1>
            <p>{{ currentPageTitle }}</p>
          </div>
        </router-link>
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
        <span v-if="!isAdmin && planBadge" :class="['badge-svip', { business: isBusiness }]">{{ planBadge }}</span>

        <!-- 管理员标记 -->
        <span v-if="isAdmin" class="admin-badge">Owner</span>

        <!-- 头像下拉菜单 -->
        <el-dropdown trigger="click" placement="bottom-end" @command="handleCommand">
          <div class="avatar-wrapper" :title="displayName">
            <div class="avatar-circle" :class="{ 'admin-avatar': isAdmin }">
              <Crown v-if="isAdmin" :size="14" />
              <span v-else>{{ userInitial }}</span>
            </div>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <template v-if="!isAdmin && !isBusiness">
                <el-dropdown-item command="devices" :icon="Monitor">
                  设备换绑
                </el-dropdown-item>
                <el-dropdown-item command="plans" :icon="PriceTag">
                  续费中心
                </el-dropdown-item>
              </template>
              <el-dropdown-item v-else-if="isBusiness" command="business-license" :icon="PriceTag">
                授权与席位
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
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Auth } from '@/utils'
import { usePlatformStore } from '@/stores/platform'
import { Monitor, PriceTag, SwitchButton } from '@element-plus/icons-vue'
import { Menu, Zap, Crown } from '@lucide/vue'

const props = defineProps({
  isAdmin: {
    type: Boolean,
    default: false
  },
  isBusiness: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle-sidebar', 'platform-change'])

const router = useRouter()
const route = useRoute()
const platformStore = usePlatformStore()
const currentPageTitle = computed(() => route.meta?.title || (props.isAdmin ? '管理后台' : '跨境电商效率工具'))
const homePath = computed(() => props.isAdmin ? '/admin/dashboard' : props.isBusiness ? '/business/overview' : '/user/tools')

const showPlatformSwitcher = computed(() => availablePlatformsForUser.value.length > 1)

// 用户信息
const displayName = computed(() => {
  if (props.isAdmin) return '管理员'
  try {
    const user = JSON.parse(localStorage.getItem('toolbox_user') || '{}')
    return user.username || user.name || '用户'
  } catch {
    return '用户'
  }
})

const userInitial = computed(() => {
  const name = displayName.value
  return name.charAt(0).toUpperCase()
})

const currentPlatform = computed(() => platformStore.currentPlatform)
const adminPlatform = computed(() => platformStore.adminPlatform)

const currentPlatformModel = computed({
  get: () => props.isAdmin ? adminPlatform.value : currentPlatform.value,
  set: (val) => handlePlatformSelect(val)
})

const availablePlatformsForUser = computed(() => {
  if (props.isAdmin) {
    // 管理员：头部插入"全部平台"选项
    const allOption = { key: 'all', short_name: '全部平台', name: '全部平台', status: 'available' }
    const platforms = platformStore.availablePlatforms.filter(p => p.status === 'available')
    return [allOption, ...platforms]
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
  } else if (command === 'business-license') {
    router.push('/business/license')
  }
}

const planBadge = computed(() => {
  try {
    const user = JSON.parse(localStorage.getItem('toolbox_user') || '{}')
    if (props.isBusiness) return '专业版'
    const code = user.plan_code || user.plan_name?.match(/Y\d+/i)?.[0]?.toUpperCase()
    if (code === 'Y999') return '陪跑包'
    if (code === 'Y199') return '冲刺包'
    return ''
  } catch (e) {
    return ''
  }
})

async function handleLogout() {
  if (props.isBusiness) {
    try {
      const snapshot = await window.electronAPI?.batch?.getSnapshot?.()
      if (snapshot?.status === 'running') {
        await ElMessageBox.confirm(
          '退出后将结束当前批次并关闭所有客户浏览器，导入数据会从本机内存清除。',
          '退出专业批量工作台？',
          { confirmButtonText: '结束并退出', cancelButtonText: '继续使用', type: 'warning' },
        )
        await window.electronAPI?.batch?.cancel?.('cancelled')
      }
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
    }
  }
  Auth.clear()
  localStorage.removeItem('toolbox_role')
  localStorage.removeItem('toolbox_user')
  localStorage.removeItem('toolbox_current_platform')
  localStorage.removeItem('toolbox_admin_platform')
  localStorage.removeItem('toolbox_platform_scope')
  // Device identity is machine-scoped, so it must survive logout.
  router.push(props.isAdmin ? '/admin/login' : '/user/login')
}

onMounted(() => {
  platformStore.loadPlatforms()
})
</script>

<style scoped>
.studio-header {
  height: var(--header-height);
  background: var(--studio-surface);
  border-bottom: none;
  box-shadow: 0 1px 0 rgba(0,0,0,0.06);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
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

/* Logo link */
.logo-link {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  cursor: pointer;
  transition: opacity var(--transition);
}

.logo-link:hover {
  opacity: 0.8;
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

.badge-svip.business {
  color: #8b6b3f;
  background: #f1eadf;
  border: 1px solid rgba(169, 133, 82, .22);
}

/* 管理员标记 */
.admin-badge {
  font-size: 10px;
  background: rgba(14, 165, 233, 0.1);
  border: 1px solid rgba(14, 165, 233, 0.2);
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

.avatar-circle.admin-avatar {
  background: linear-gradient(135deg, var(--studio-accent), var(--studio-accent-light));
  color: white;
}

.avatar-circle.admin-avatar:hover {
  background: linear-gradient(135deg, var(--studio-accent-hover), var(--studio-accent));
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

/* v6 明亮应用顶栏 */
.studio-header {
  height: var(--header-height);
  border-bottom: 1px solid var(--color-border);
  background: rgba(252, 252, 253, .9);
  box-shadow: none;
  z-index: var(--z-header);
}
.header-inner { padding: 0 24px; }
.logo-link { gap: 11px; }
.logo-icon {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--color-primary);
  box-shadow: 0 6px 14px rgba(45, 95, 202, .15);
}
.header-title h1 { color: var(--color-text); font-size: 13px; letter-spacing: -.01em; }
.header-title p { margin-top: 1px; color: var(--color-text-tertiary); font-size: 10px; }
.hamburger-btn { border-color: var(--color-border); color: var(--color-text-secondary); }
.hamburger-btn:hover { color: var(--color-primary); background: var(--color-primary-soft); }
:deep(.platform-select .el-select__wrapper),
:deep(.platform-select .el-input__wrapper) { min-height: 34px; background: var(--color-surface-soft) !important; box-shadow: 0 0 0 1px var(--color-border) inset !important; }
.badge-svip {
  padding: 4px 8px;
  border: 1px solid rgba(169, 133, 82, .2);
  border-radius: 999px;
  color: var(--color-premium);
  background: var(--color-premium-soft);
  letter-spacing: .04em;
}
.admin-badge { border-color: rgba(45, 95, 202, .16); border-radius: 999px; color: var(--color-primary); background: var(--color-primary-soft); }
.avatar-circle { width: 32px; height: 32px; border: 1px solid var(--color-border); color: var(--color-text-secondary); background: var(--color-surface-soft); }
.avatar-circle:hover { border-color: var(--color-border-strong); color: var(--color-text); background: var(--color-surface); }
.avatar-circle.admin-avatar { border-color: var(--color-primary); background: var(--color-primary); }

@media (max-width: 640px) {
  .header-inner { padding: 0 14px; }
  .header-title p { display: none; }
}
</style>
