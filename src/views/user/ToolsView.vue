<template>
  <div class="toolbox-page">
    <header class="toolbox-header">
      <div>
        <span class="toolbox-eyebrow">自动化工作台</span>
        <h2>选择一个工具开始</h2>
        <p>选择需要完成的业务，点击后系统会自动打开并处理。</p>
      </div>
      <router-link class="plan-chip" to="/user/plans">
        <ShieldCheck :size="15" />
        {{ currentPlanName }}
      </router-link>
    </header>

    <div v-if="loading" class="tool-grid" aria-label="工具加载中">
      <div v-for="item in 6" :key="item" class="tool-card skeleton-card"></div>
    </div>

    <div v-else-if="tools.length" class="tool-grid">
      <button
        v-for="tool in tools"
        :key="tool.id"
        type="button"
        :class="['tool-card', `is-${toolState(tool)}`, { 'is-launching': launchingToolId === tool.id, 'is-focused': route.query?.tool === tool.id }]"
        :disabled="launchingToolId !== null || toolState(tool) === 'maintenance'"
        :data-testid="'tool-card-' + tool.name"
        @click="handleToolClick(tool)"
      >
        <span v-if="launchingToolId === tool.id" class="launch-rail" aria-hidden="true"></span>
        <span class="tool-card-top">
          <span class="tool-icon"><component :is="toolIcon(tool)" :size="21" /></span>
          <span v-if="toolState(tool) === 'locked'" class="state-badge locked"><LockKeyhole :size="12" /> 当前套餐未包含</span>
          <span v-else-if="toolState(tool) === 'maintenance'" class="state-badge maintenance">暂时不可用</span>
        </span>

        <span class="tool-copy">
          <strong>{{ tool.name }}</strong>
          <span>{{ tool.description || defaultDescription(tool) }}</span>
        </span>

        <span class="tool-action">
          <template v-if="launchingToolId === tool.id">
            <LoaderCircle :size="16" class="spin" /> 正在打开…
          </template>
          <template v-else-if="toolState(tool) === 'locked'">
            查看可用套餐 <ArrowRight :size="16" />
          </template>
          <template v-else-if="toolState(tool) === 'maintenance'">维护中</template>
          <template v-else>
            一键启动 <ArrowRight :size="16" />
          </template>
        </span>
      </button>
    </div>

    <div v-else class="empty-state">
      <Wrench :size="44" :stroke-width="1.5" />
      <h3>当前平台暂无可用工具</h3>
      <p>你可以切换平台，或稍后再试。</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRight,
  BadgeDollarSign,
  Boxes,
  LoaderCircle,
  LockKeyhole,
  Megaphone,
  PackageCheck,
  PackagePlus,
  ShieldCheck,
  Truck,
  UserPlus,
  Warehouse,
  Wrench,
  Zap,
} from '@lucide/vue'
import { getTools, createToolLaunchGrant } from '@/utils/api'
import { showToast } from '@/utils'
import { useAppStore } from '@/stores/app'
import { usePlatformStore } from '@/stores/platform'

const router = useRouter() || { push: () => {} }
const route = useRoute() || { query: {} }
const appStore = useAppStore()
const platformStore = usePlatformStore()
const tools = ref([])
const loading = ref(true)
const launchingToolId = ref(null)

const userInfo = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('toolbox_user') || '{}')
  } catch {
    return {}
  }
})

const currentPlanName = computed(() => userInfo.value.plan_name || '当前授权')
const currentPlanCode = computed(() => {
  return userInfo.value.plan_code || userInfo.value.plan_name?.match(/Y\d+/i)?.[0]?.toUpperCase() || ''
})

const iconMap = {
  register: UserPlus,
  ali_register: UserPlus,
  logistics_standard: Truck,
  logistics_template: Truck,
  logistics_cost: BadgeDollarSign,
  ad_script: Megaphone,
  ads: Megaphone,
  ship_script: PackageCheck,
  ali_ship: PackageCheck,
  listing_script: PackagePlus,
  listing: PackagePlus,
  ali_listing: PackagePlus,
  fba_agl: Warehouse,
}

function toolIcon(tool) {
  return iconMap[tool.capability_key] || (tool.category === 'automation' ? Zap : Boxes)
}

function defaultDescription(tool) {
  return `自动处理${tool.name || '当前功能'}中的重复操作`
}

function toolState(tool) {
  const releaseStatus = tool.release_status || (tool.status === 'online' ? 'available' : tool.status)
  if (!['available', 'beta', 'online'].includes(releaseStatus)) return 'maintenance'
  const availablePlans = Array.isArray(tool.available_plans)
    ? tool.available_plans.map(item => String(item).toUpperCase())
    : []
  if (availablePlans.length && currentPlanCode.value && !availablePlans.includes(currentPlanCode.value)) return 'locked'
  return 'available'
}

function handleToolClick(tool) {
  const state = toolState(tool)
  if (state === 'locked') {
    router.push({ path: '/user/plans', query: { tool: tool.id } })
    return
  }
  if (state === 'maintenance') return
  runTool(tool)
}

async function loadData() {
  loading.value = true
  try {
    tools.value = await getTools({ platform_key: platformStore.currentPlatform })
  } catch (error) {
    showToast('工具加载失败，请稍后重试', 'error')
  } finally {
    loading.value = false
  }
}

async function runTool(tool) {
  if (launchingToolId.value !== null) return
  launchingToolId.value = tool.id
  try {
    const platformKey = platformStore.currentPlatform
    const deviceId = localStorage.getItem('toolbox_device_id') || ''
    const response = await createToolLaunchGrant(tool.id, { platformKey, deviceId })
    const grant = response?.launch_data || response?.grant
    if (!grant?.token || !grant?.target_url) throw new Error('工具启动数据不完整，请重试')

    appStore.openTool({
      id: grant.tool_id || tool.id,
      name: grant.tool_name || tool.name,
      module: grant.tool_module || tool.module,
      category: grant.category || tool.category,
      platformKey: grant.platform_key || platformKey,
      capabilityKey: tool.capability_key,
      targetUrl: grant.target_url,
      launchGrant: {
        token: grant.token,
        expiresAt: grant.expires_at || response.expires_at,
        expiresIn: response.expires_in,
        scriptKey: grant.script_key,
        runnerApiVersion: grant.runner_api_version || 1,
        toolVersion: grant.tool_version || '1.0.0',
        toolManifest: grant.tool_manifest,
        toolSignature: grant.tool_signature,
        signingKeyId: grant.signing_key_id,
        signatureRequired: Boolean(grant.signature_required),
      },
    })
  } catch (error) {
    if (error?.code === 3006) {
      showToast('当前套餐暂未包含该工具', 'warning')
      router.push({ path: '/user/plans', query: { tool: tool.id } })
    } else if (error?.code === 3007) {
      showToast('当前授权暂未包含该平台，请联系客服', 'warning')
    } else if (error?.code === 3003) {
      showToast('当前设备尚未获得授权，请管理设备或联系客服', 'warning')
    } else {
      showToast(error?.message || '暂时无法启动，请重试', 'error')
    }
  } finally {
    launchingToolId.value = null
  }
}

watch(() => platformStore.currentPlatform, loadData)
onMounted(loadData)
</script>

<style scoped>
.toolbox-page {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.toolbox-header {
  min-height: 78px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

.toolbox-eyebrow {
  display: block;
  margin-bottom: 8px;
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .12em;
}

.toolbox-header h2 {
  margin: 0;
  color: var(--studio-text-main);
  font-size: var(--font-page-title);
  line-height: 1.3;
  letter-spacing: -.03em;
}

.toolbox-header p {
  margin: 7px 0 0;
  color: var(--studio-text-muted);
  font-size: 13px;
}

.plan-chip {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid rgba(169, 133, 82, .22);
  border-radius: 999px;
  color: var(--color-premium);
  background: var(--color-premium-soft);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}

.plan-chip:hover {
  color: var(--studio-accent);
  border-color: var(--studio-accent-light);
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.tool-card {
  position: relative;
  min-height: 176px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 22px;
  border: 1px solid var(--studio-border);
  border-radius: var(--radius-lg);
  color: var(--studio-text-main);
  background: var(--studio-surface);
  box-shadow: var(--studio-shadow);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition: transform var(--motion-normal) var(--ease-emphasized), border-color var(--motion-fast), box-shadow var(--motion-normal);
}

.tool-card:not(:disabled):hover {
  transform: translateY(-3px);
  border-color: #bdcbe8;
  box-shadow: var(--studio-shadow-hover);
}

.tool-card:focus-visible {
  outline: 3px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.tool-card:disabled {
  cursor: default;
}

.tool-card-top {
  min-height: 38px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.tool-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: var(--studio-accent);
  background: var(--studio-accent-bg);
}

.state-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.state-badge.locked {
  color: #b45309;
  background: rgba(255, 153, 0, 0.12);
}

.state-badge.maintenance {
  color: var(--studio-text-muted);
  background: var(--studio-bg-hover);
}

.tool-copy {
  display: block;
  flex: 1;
  padding: 18px 0 16px;
}

.tool-copy strong,
.tool-copy span {
  display: block;
}

.tool-copy strong {
  margin-bottom: 8px;
  font-size: 17px;
  letter-spacing: -.015em;
  line-height: 1.35;
}

.tool-copy span {
  color: var(--studio-text-muted);
  font-size: 12px;
  line-height: 1.65;
}

.tool-action {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  color: var(--studio-accent);
  font-size: 12px;
  font-weight: 700;
}

.is-locked .tool-icon,
.is-locked .tool-action {
  color: var(--color-warning);
  background-color: var(--color-warning-soft);
}

.is-maintenance {
  opacity: 0.68;
}

.is-maintenance .tool-action {
  color: var(--studio-text-muted);
}

.is-launching {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-focus-ring), var(--shadow-medium);
}

.launch-rail {
  position: absolute;
  top: 0;
  left: -42%;
  width: 42%;
  height: 3px;
  border-radius: 0 999px 999px 0;
  background: linear-gradient(90deg, transparent, var(--color-primary), #8eace8);
  animation: launchRail var(--motion-signature) var(--ease-emphasized) both;
}

.is-focused {
  border-color: var(--studio-accent);
  box-shadow: 0 0 0 3px var(--color-focus-ring), var(--studio-shadow-hover);
}

.spin {
  animation: spin 0.8s linear infinite;
}

.skeleton-card {
  border-color: transparent;
  background: linear-gradient(90deg, #eef2f7 25%, #f8fafc 50%, #eef2f7 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}

.empty-state {
  min-height: 320px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 9px;
  color: var(--studio-text-muted);
  text-align: center;
}

.empty-state h3,
.empty-state p {
  margin: 0;
}

.empty-state h3 {
  color: var(--studio-text-main);
  font-size: 16px;
}

.empty-state p {
  font-size: 13px;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { to { background-position: -200% 0; } }
@keyframes launchRail { to { left: 100%; } }

@media (max-width: 620px) {
  .toolbox-header { flex-direction: column; gap: 12px; }
  .tool-grid { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .launch-rail { display: none; }
}
</style>
