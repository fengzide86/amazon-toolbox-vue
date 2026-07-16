<template>
  <header class="studio-header">
    <div class="header-inner">
      <div class="header-left">
        <button class="hamburger-btn" type="button" aria-label="打开导航菜单" title="打开导航菜单" @click="$emit('toggle-sidebar')">
          <Menu :size="18" />
        </button>
        <router-link :to="homePath" class="logo-link">
          <div class="logo-icon"><Zap :size="17" /></div>
          <div class="header-title">
            <h1>{{ isAdmin ? '运营控制中心' : isBusiness ? '专业批量工作台' : '自动化工具箱' }}</h1>
            <p>{{ currentPageTitle }}</p>
          </div>
        </router-link>
      </div>

      <div v-if="showPlatformSwitcher" class="platform-switcher" data-testid="platform-switcher">
        <el-select v-model="currentPlatformModel" size="small" class="platform-select" @change="handlePlatformSelect">
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
        <span v-if="!isAdmin && planBadge" :class="['plan-badge', { business: isBusiness }]">{{ planBadge }}</span>
        <MessageCenter v-if="!isAdmin" />
        <UpdateStatusEntry :details-disabled="isBusiness && route.name === 'BusinessWorkspace'" />
        <span v-if="isAdmin" class="admin-badge">Owner</span>

        <el-dropdown trigger="click" placement="bottom-end" @command="handleCommand">
          <button class="avatar-wrapper" type="button" :title="displayName" :aria-label="`${displayName}账号菜单`">
            <span class="avatar-circle" :class="{ 'admin-avatar': isAdmin }">
              <Crown v-if="isAdmin" :size="15" />
              <span v-else>{{ userInitial }}</span>
            </span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <template v-if="!isAdmin && !isBusiness">
                <el-dropdown-item command="devices" :icon="Monitor">设备换绑</el-dropdown-item>
                <el-dropdown-item command="plans" :icon="PriceTag">续费中心</el-dropdown-item>
              </template>
              <el-dropdown-item v-else-if="isBusiness" command="business-license" :icon="PriceTag">授权与席位</el-dropdown-item>
              <el-dropdown-item v-if="updateStore.supported" command="check-update" :icon="Refresh">检查更新</el-dropdown-item>
              <el-dropdown-item divided command="logout" :icon="SwitchButton" class="logout-item">退出系统</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
    <div v-if="updateStore.state.status === 'downloading'" class="header-download-progress" aria-hidden="true">
      <span :style="{ width: `${updateStore.state.percent ?? 0}%` }" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Monitor, PriceTag, Refresh, SwitchButton } from '@element-plus/icons-vue'
import { Crown, Menu, Zap } from '@lucide/vue'

import MessageCenter from '@/features/announcements/MessageCenter.vue'
import UpdateStatusEntry from '@/features/updates/UpdateStatusEntry.vue'
import { useUpdateStore } from '@/features/updates/store'
import { Auth } from '@/utils'
import { usePlatformStore } from '@/stores/platform'

const props = withDefaults(defineProps<{ isAdmin?: boolean; isBusiness?: boolean }>(), { isAdmin: false, isBusiness: false })
const emit = defineEmits<{ 'toggle-sidebar': []; 'platform-change': [platformKey: string] }>()
interface PlatformOption { key: string; short_name: string; name: string; status: string }

const router = useRouter()
const route = useRoute()
const platformStore = usePlatformStore()
const updateStore = useUpdateStore()
const currentPageTitle = computed(() => String(route.meta?.title || (props.isAdmin ? '管理后台' : '跨境电商效率工具')))
const homePath = computed(() => props.isAdmin ? '/admin/dashboard' : props.isBusiness ? '/business/overview' : '/user/tools')
const showPlatformSwitcher = computed(() => availablePlatformsForUser.value.length > 1)
const currentPlatform = computed(() => platformStore.currentPlatform)
const adminPlatform = computed(() => platformStore.adminPlatform)

const displayName = computed(() => {
  if (props.isAdmin) return '管理员'
  try {
    const user = JSON.parse(localStorage.getItem('toolbox_user') || '{}')
    return user.username || user.name || '用户'
  } catch { return '用户' }
})
const userInitial = computed(() => displayName.value.charAt(0).toUpperCase())
const currentPlatformModel = computed({
  get: () => props.isAdmin ? adminPlatform.value : currentPlatform.value,
  set: value => handlePlatformSelect(value),
})
const availablePlatformsForUser = computed<PlatformOption[]>(() => {
  if (props.isAdmin) {
    const allOption = { key: 'all', short_name: '全部平台', name: '全部平台', status: 'available' }
    return [allOption, ...(platformStore.availablePlatforms as PlatformOption[]).filter(platform => platform.status === 'available')]
  }
  return platformStore.getAvailablePlatformsForUser(getPlatformScope()) as PlatformOption[]
})
const planBadge = computed(() => {
  try {
    const user = JSON.parse(localStorage.getItem('toolbox_user') || '{}')
    if (props.isBusiness) return '专业版'
    const code = user.plan_code || user.plan_name?.match(/Y\d+/i)?.[0]?.toUpperCase()
    return code === 'Y999' ? '陪跑包' : code === 'Y199' ? '冲刺包' : ''
  } catch { return '' }
})

function getPlatformScope(): string | null {
  try {
    const scope = localStorage.getItem('toolbox_platform_scope')
    if (scope) {
      const parsed: unknown = JSON.parse(scope)
      if (Array.isArray(parsed)) return parsed.join(',')
    }
  } catch { /* Ignore invalid legacy values. */ }
  try {
    const authData = JSON.parse(localStorage.getItem('toolbox_auth') || '{}')
    if (authData.platform_scope) return Array.isArray(authData.platform_scope) ? authData.platform_scope.join(',') : authData.platform_scope
  } catch { /* Ignore invalid legacy values. */ }
  return null
}
function hasPermission(platformKey: string): boolean {
  return props.isAdmin || platformStore.hasPlatformPermission(getPlatformScope(), platformKey)
}
function handlePlatformSelect(platformKey: string): void {
  if (!hasPermission(platformKey)) return
  if (props.isAdmin) platformStore.setAdminPlatform(platformKey)
  else platformStore.setPlatform(platformKey)
  emit('platform-change', platformKey)
}
function handleCommand(command: string): void {
  if (command === 'logout') void handleLogout()
  else if (command === 'devices') void router.push(props.isAdmin ? '/admin/dashboard' : '/user/devices')
  else if (command === 'plans') void router.push(props.isAdmin ? '/admin/orders' : '/user/plans')
  else if (command === 'business-license') void router.push('/business/license')
  else if (command === 'check-update') void updateStore.checkManually()
}
async function handleLogout(): Promise<void> {
  if (props.isBusiness) {
    try {
      const snapshot = await window.electronAPI?.batch?.getSnapshot?.()
      if (snapshot?.status === 'running') {
        await ElMessageBox.confirm('退出后将结束当前批次并关闭所有客户浏览器，导入数据会从本机内存清除。', '退出专业批量工作台？', {
          confirmButtonText: '结束并退出', cancelButtonText: '继续使用', type: 'warning',
        })
        await window.electronAPI?.batch?.cancel?.('cancelled')
      }
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
    }
  }
  Auth.clear()
  for (const key of ['toolbox_role', 'toolbox_user', 'toolbox_current_platform', 'toolbox_admin_platform', 'toolbox_platform_scope']) localStorage.removeItem(key)
  await router.push(props.isAdmin ? '/admin/login' : '/user/login')
}

onMounted(() => platformStore.loadPlatforms())
</script>

<style scoped>
.studio-header{position:sticky;top:0;z-index:var(--z-header);height:var(--header-height);margin:0;border-bottom:1px solid var(--color-border);background:rgba(252,252,253,.94);backdrop-filter:blur(18px)}.header-inner{height:100%;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:0 24px}.header-left,.header-right,.logo-link{display:flex;align-items:center}.header-left{min-width:0;gap:11px}.header-right{flex-shrink:0;gap:10px}.logo-link{min-width:0;gap:11px;text-decoration:none}.logo-icon{width:34px;height:34px;display:grid;flex-shrink:0;place-items:center;border-radius:10px;color:#fff;background:var(--color-primary);box-shadow:0 6px 14px rgba(45,95,202,.15)}.header-title{min-width:0}.header-title h1{margin:0;overflow:hidden;color:var(--color-text);font-size:14px;font-weight:750;letter-spacing:-.01em;text-overflow:ellipsis;white-space:nowrap}.header-title p{margin:2px 0 0;overflow:hidden;color:var(--color-text-tertiary);font-size:var(--type-micro);text-overflow:ellipsis;white-space:nowrap}.hamburger-btn{display:none;width:36px;height:36px;flex-shrink:0;place-items:center;padding:0;border:1px solid var(--color-border);border-radius:10px;color:var(--color-text-secondary);background:var(--color-surface);cursor:pointer}.platform-switcher{flex:0 1 150px}.platform-select{width:150px}:deep(.platform-select .el-select__wrapper),:deep(.platform-select .el-input__wrapper){min-height:36px;background:var(--color-surface-soft)!important;box-shadow:0 0 0 1px var(--color-border) inset!important}:deep(.platform-select .el-input__inner){font-size:var(--type-control)}.plan-badge,.admin-badge{padding:5px 9px;border:1px solid rgba(169,133,82,.2);border-radius:999px;color:var(--color-premium);background:var(--color-premium-soft);font-size:var(--type-micro);font-weight:750;letter-spacing:.03em;white-space:nowrap}.admin-badge{border-color:rgba(45,95,202,.16);color:var(--color-primary);background:var(--color-primary-soft)}.avatar-wrapper{width:36px;height:36px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer}.avatar-circle{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;color:var(--color-text-secondary);background:var(--color-surface-soft);font-size:var(--type-control);font-weight:750;transition:background var(--motion-fast),color var(--motion-fast)}.avatar-wrapper:hover .avatar-circle{color:var(--color-primary);background:var(--color-primary-soft)}.avatar-circle.admin-avatar{color:#fff;background:var(--color-primary)}.header-download-progress{position:absolute;right:0;bottom:-1px;left:0;height:2px;overflow:hidden;background:var(--color-primary-soft)}.header-download-progress span{display:block;height:100%;background:var(--color-primary);transition:width var(--motion-fast)}.logout-item{color:var(--color-danger)!important}
@media(max-width:1024px){.hamburger-btn{display:grid}.header-inner{padding:0 18px}.plan-badge{display:none}}
@media(max-width:767px){.header-inner{gap:10px;padding:0 12px}.platform-switcher{display:none}.header-title p{display:none}.header-right{gap:6px}.logo-icon{width:32px;height:32px}.header-title h1{max-width:170px}}
@media(max-width:520px){.header-title h1{max-width:112px}.admin-badge{display:none}}
@media(prefers-reduced-motion:reduce){.header-download-progress span{transition:none}}
</style>
