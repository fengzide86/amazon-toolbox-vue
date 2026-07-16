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
          <span v-if="toolCapabilities(tool).length" class="capability-tags" aria-label="工具能力">
            <span v-for="tag in toolCapabilities(tool)" :key="tag">{{ tag }}</span>
          </span>
        </span>

        <span class="tool-action">
          <span
            v-if="hasToolDetails(tool)"
            class="learn-more"
            role="button"
            tabindex="0"
            @click.stop="openDetails(tool)"
            @keydown.enter.stop.prevent="openDetails(tool)"
            @keydown.space.stop.prevent="openDetails(tool)"
          >了解能力</span>
          <span class="action-label">
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
        </span>
      </button>
    </div>

    <div v-else class="empty-state">
      <Wrench :size="44" :stroke-width="1.5" />
      <h3>当前平台暂无可用工具</h3>
      <p>你可以切换平台，或稍后再试。</p>
    </div>

    <el-drawer v-model="detailsVisible" direction="rtl" size="min(420px, 92vw)" class="tool-detail-drawer">
      <template #header>
        <div class="drawer-heading">
          <span class="drawer-icon"><component :is="detailsTool ? toolIcon(detailsTool) : Boxes" :size="20" /></span>
          <div><small>工具能力</small><strong>{{ detailsTool?.name }}</strong></div>
        </div>
      </template>
      <div v-if="detailsTool" class="drawer-content">
        <p class="drawer-description">{{ detailsTool.description || defaultDescription(detailsTool) }}</p>
        <section v-if="toolCapabilities(detailsTool).length">
          <span class="section-label">可以帮你完成</span>
          <div class="drawer-tags"><span v-for="tag in toolCapabilities(detailsTool)" :key="tag"><CheckCircle2 :size="14" />{{ tag }}</span></div>
        </section>
        <section v-if="normalizedList(detailsTool.preparation_notes).length">
          <span class="section-label">开始前准备</span>
          <ul><li v-for="note in normalizedList(detailsTool.preparation_notes)" :key="note">{{ note }}</li></ul>
        </section>
        <section v-if="normalizedList(detailsTool.intervention_scenarios).length">
          <span class="section-label">什么时候需要你操作</span>
          <ul><li v-for="scenario in normalizedList(detailsTool.intervention_scenarios)" :key="scenario">{{ scenario }}</li></ul>
        </section>
        <div class="drawer-assurance"><ShieldCheck :size="17" /><span>系统会自动处理；确实需要你操作时，才会明确提醒。</span></div>
      </div>
      <template #footer>
        <button class="drawer-primary" :disabled="detailsTool && toolState(detailsTool) === 'maintenance'" @click="launchFromDetails">
          {{ detailsActionText }} <ArrowRight :size="16" />
        </button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRight,
  BadgeDollarSign,
  Boxes,
  CheckCircle2,
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
const detailsVisible = ref(false)
const detailsTool = ref(null)

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

function normalizedList(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(/[\n,，]/).map(item => item.trim()).filter(Boolean)
  return []
}

function toolCapabilities(tool) {
  return normalizedList(tool?.capability_tags).slice(0, 3)
}

function hasToolDetails(tool) {
  return toolCapabilities(tool).length
    || normalizedList(tool?.preparation_notes).length
    || normalizedList(tool?.intervention_scenarios).length
}

function openDetails(tool) {
  detailsTool.value = tool
  detailsVisible.value = true
}

const detailsActionText = computed(() => {
  if (!detailsTool.value) return '关闭'
  if (toolState(detailsTool.value) === 'locked') return '查看可用套餐'
  if (toolState(detailsTool.value) === 'maintenance') return '当前维护中'
  return '开始处理'
})

function launchFromDetails() {
  if (!detailsTool.value || toolState(detailsTool.value) === 'maintenance') return
  const tool = detailsTool.value
  detailsVisible.value = false
  handleToolClick(tool)
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
  font-size:var(--type-meta);
  font-weight: 800;
  letter-spacing: .12em;
}

.toolbox-header h2 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--type-page);
  line-height: 1.3;
  letter-spacing: -.03em;
}

.toolbox-header p {
  margin: 7px 0 0;
  color: var(--color-text-secondary);
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
  font-size:var(--type-control);
  font-weight: 600;
  text-decoration: none;
}

.plan-chip:hover {
  color: var(--color-primary);
  border-color: var(--color-primary-muted);
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.tool-card:last-child:nth-child(odd) { grid-column: 1 / -1; }

.tool-card {
  position: relative;
  min-height: 176px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 22px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--shadow-low);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition: transform var(--motion-normal) var(--ease-emphasized), border-color var(--motion-fast), box-shadow var(--motion-normal);
}

.tool-card:not(:disabled):hover {
  transform: translateY(-3px);
  border-color: #bdcbe8;
  box-shadow: var(--shadow-medium);
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
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.state-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 7px;
  border-radius: 999px;
  font-size:var(--type-micro);
  font-weight: 700;
}

.state-badge.locked {
  color: #b45309;
  background: rgba(255, 153, 0, 0.12);
}

.state-badge.maintenance {
  color: var(--color-text-secondary);
  background: var(--color-surface-soft);
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
  color: var(--color-text-secondary);
  font-size:var(--type-control);
  line-height: 1.65;
}

.tool-copy .capability-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 13px;
}

.tool-copy .capability-tags > span {
  display: inline-flex;
  padding: 3px 7px;
  border: 1px solid rgba(45, 95, 202, .12);
  border-radius: 6px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  font-size:var(--type-micro);
  font-weight: 650;
  line-height: 1.45;
}

.tool-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  color: var(--color-primary);
  font-size:var(--type-control);
  font-weight: 700;
}

.learn-more {
  position: relative;
  z-index: 2;
  padding: 4px 0;
  color: var(--color-text-secondary);
  font-size: var(--type-control);
  font-weight: 600;
}

.learn-more:hover,
.learn-more:focus-visible {
  color: var(--color-primary);
  outline: none;
}

.action-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.drawer-heading {
  display: flex;
  align-items: center;
  gap: 11px;
}

.drawer-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.drawer-heading div { display: grid; gap: 3px; }
.drawer-heading small { color: var(--color-text-secondary); font-size:var(--type-micro); letter-spacing: .08em; }
.drawer-heading strong { color: var(--color-text); font-size: 15px; }
.drawer-content { display: grid; gap: 25px; }
.drawer-description { margin: 0; color: var(--color-text-secondary); font-size: 13px; line-height: 1.75; }
.drawer-content section { display: grid; gap: 11px; }
.section-label { color: var(--color-text); font-size:var(--type-control); font-weight: 750; }
.drawer-tags { display: grid; gap: 7px; }
.drawer-tags > span { display: flex; align-items: center; gap: 8px; padding: 10px 11px; border-radius: 10px; color: var(--color-primary); background: var(--color-primary-soft); font-size:var(--type-control); }
.drawer-content ul { margin: 0; padding-left: 18px; color: var(--color-text-secondary); font-size:var(--type-control); line-height: 1.8; }
.drawer-assurance { display: flex; align-items: flex-start; gap: 9px; padding: 12px; border-radius: 11px; color: var(--color-success); background: var(--color-success-soft); }
.drawer-assurance span { font-size:var(--type-meta); line-height: 1.6; }
.drawer-primary { width: 100%; height: 42px; display: flex; align-items: center; justify-content: center; gap: 7px; border: 0; border-radius: 11px; color: #fff; background: var(--color-primary); font-weight: 700; cursor: pointer; }
.drawer-primary:disabled { opacity: .5; cursor: default; }
:deep(.tool-detail-drawer .el-drawer__header) { margin: 0; padding: 22px 22px 16px; border-bottom: 1px solid var(--color-border); }
:deep(.tool-detail-drawer .el-drawer__body) { padding: 22px; }
:deep(.tool-detail-drawer .el-drawer__footer) { padding: 16px 22px 22px; border-top: 1px solid var(--color-border); }

.is-locked .tool-icon,
.is-locked .tool-action {
  color: var(--color-warning);
  background-color: var(--color-warning-soft);
}

.is-maintenance {
  opacity: 0.68;
}

.is-maintenance .tool-action {
  color: var(--color-text-secondary);
}

.is-launching {
  opacity: 1;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-focus-ring), var(--shadow-medium);
  animation: launchCardConfirm var(--motion-signature) var(--ease-emphasized) both;
}

.launch-rail {
  position: absolute;
  top: 0;
  left: -58%;
  width: 58%;
  height: 4px;
  border-radius: 0 999px 999px 0;
  background: linear-gradient(90deg, transparent 0%, #8eace8 54%, var(--color-primary) 78%, transparent 100%);
  filter: drop-shadow(0 2px 4px rgba(45, 95, 202, .24));
  animation: launchRail var(--motion-signature) var(--ease-emphasized) both;
}

.is-focused {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-focus-ring), var(--shadow-medium);
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
  color: var(--color-text-secondary);
  text-align: center;
}

.empty-state h3,
.empty-state p {
  margin: 0;
}

.empty-state h3 {
  color: var(--color-text);
  font-size: 16px;
}

.empty-state p {
  font-size: 13px;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { to { background-position: -200% 0; } }
@keyframes launchRail { to { left: 100%; } }
@keyframes launchCardConfirm {
  0% { transform: scale(1); }
  45% { transform: scale(.992); }
  100% { transform: scale(1); }
}

@media (max-width: 620px) {
  .toolbox-header { flex-direction: column; gap: 12px; }
  .tool-grid { grid-template-columns: 1fr; }
  .tool-card:last-child:nth-child(odd) { grid-column: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .launch-rail { display: none; }
  .is-launching { animation: none; }
}
</style>
