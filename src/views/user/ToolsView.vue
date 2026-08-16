<template>
  <div class="toolbox-page" data-testid="tools-page">
    <PageHeader
      eyebrow="流程演示工具"
      title="选择一个工具开始处理"
      description="当前工具仅展示模拟流程，不会登录、读取或修改真实店铺数据。"
    >
      <template #actions>
        <router-link class="plan-chip" to="/user/plans">
          <ShieldCheck :size="15" />
          {{ currentPlanName }}
        </router-link>
      </template>
    </PageHeader>
    <AsyncStateNotice v-if="staleError" state="stale" :message="staleError" @retry="loadData" />

    <div v-if="loading" class="tool-grid" aria-label="工具加载中">
      <div v-for="item in 6" :key="item" class="tool-card skeleton-card"></div>
    </div>

    <div v-else-if="loadError" class="empty-state error-state" role="alert">
      <CircleAlert :size="44" :stroke-width="1.5" />
      <h3>工具列表暂时无法加载</h3>
      <p>{{ loadError }}</p>
      <button type="button" @click="loadData">重新加载</button>
    </div>

    <div v-else-if="tools.length" class="tool-grid">
      <button
        v-for="tool in tools"
        :key="tool.id"
        type="button"
        :class="['tool-card', `is-${toolState(tool)}`, { 'is-launching': launchingToolId === tool.id, 'is-focused': route.query?.tool === tool.id }]"
        :disabled="launchingToolId !== null || toolState(tool) === 'maintenance'"
        :aria-label="`${tool.name}，${liveUnavailable(tool) ? '需要下载桌面端运行' : toolState(tool) === 'available' ? '打开能力说明并开始演示' : toolState(tool) === 'locked' ? '查看可用套餐' : '暂时不可用'}`"
        :data-testid="'tool-card-' + tool.name"
        @click="hasToolDetails(tool) ? openDetails(tool) : handleToolClick(tool)"
      >
        <span v-if="launchingToolId === tool.id" class="launch-rail" aria-hidden="true"></span>
        <span class="tool-card-top">
          <span class="tool-icon"><component :is="toolIcon(tool)" :size="21" /></span>
          <span v-if="toolState(tool) === 'locked'" class="state-badge locked"><LockKeyhole :size="12" /> 当前套餐未包含</span>
          <span v-else-if="toolState(tool) === 'maintenance'" class="state-badge maintenance">暂时不可用</span>
          <span v-else :class="['state-badge', isLiveTool(tool) ? 'live' : 'demo']">{{ liveUnavailable(tool) ? '桌面端执行' : isLiveTool(tool) ? (tool.availability === 'live_beta' ? '真实执行 Beta' : '真实执行') : '交互演示' }}</span>
        </span>

        <span class="tool-copy">
          <strong>{{ tool.name }}</strong>
          <span>{{ tool.description || defaultDescription(tool) }}</span>
          <span v-if="toolCapabilities(tool).length" class="capability-tags" aria-label="工具能力">
            <span v-for="tag in toolCapabilities(tool)" :key="tag">{{ tag }}</span>
          </span>
          <span class="tool-operational-meta">
            <span><small>目标平台</small><b>{{ toolPlatformLabel(tool) }}</b></span>
            <span><small>输入字段</small><b>{{ toolInputCount(tool) }} 项</b></span>
            <span><small>执行产出</small><b>结果核验＋截图</b></span>
          </span>
        </span>

        <span class="tool-action">
          <span
            v-if="hasToolDetails(tool)"
            class="learn-more"
          >了解能力</span>
          <span class="action-label">
          <template v-if="launchingToolId === tool.id">
            <LoaderCircle :size="16" class="spin" /> 正在打开…
          </template>
          <template v-else-if="toolState(tool) === 'locked'">
            查看可用套餐 <ArrowRight :size="16" />
          </template>
          <template v-else-if="toolState(tool) === 'maintenance'">维护中</template>
          <template v-else-if="liveUnavailable(tool)">
            下载桌面端 <Download :size="16" />
          </template>
          <template v-else>
            {{ isLiveTool(tool) ? '开始执行' : '开始交互演示' }} <ArrowRight :size="16" />
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
        <div class="drawer-assurance"><ShieldCheck :size="17" /><span>{{ liveUnavailable(detailsTool) ? '真实自动化需要桌面端本地 Runner；网页版不会读取或执行外部平台操作。' : isLiveTool(detailsTool) ? '工具将在本机浏览器中操作比赛模拟平台，登录数据不上传。' : '这是本地交互沙盒，会真实填写和点击，但不访问外部平台。' }}</span></div>
      </div>
      <template #footer>
        <button class="drawer-primary" :disabled="Boolean(detailsTool && toolState(detailsTool) === 'maintenance')" @click="launchFromDetails">
          {{ detailsActionText }} <ArrowRight :size="16" />
        </button>
      </template>
    </el-drawer>

    <el-dialog v-model="runDialogVisible" width="min(560px, 94vw)" :close-on-click-modal="!launchingToolId" destroy-on-close>
      <template #header>
        <div class="run-dialog-heading"><small>LIVE AUTOMATION</small><h3>{{ pendingTool?.name }}</h3><p>参数只会发送给本机执行器。</p></div>
      </template>
      <el-form v-if="pendingTool" label-position="top" class="run-form">
        <el-form-item v-for="field in pendingTool.single_input_schema || []" :key="field.key" :label="field.label" :required="field.required">
          <el-input-number v-if="field.type === 'number'" :model-value="numberInput(field.key)" :controls="false" @update:model-value="value => setNumberInput(field.key, value)" />
          <el-select v-else-if="field.type === 'select'" v-model="runInput[field.key]" placeholder="请选择"><el-option v-for="option in field.options || []" :key="option" :label="option" :value="option" /></el-select>
          <el-input v-else v-model="runInput[field.key]" :placeholder="field.type === 'file' ? '输入本机文件完整路径' : `请输入${field.label}`" />
        </el-form-item>
      </el-form>
      <template #footer><div class="run-dialog-actions"><el-button :disabled="Boolean(launchingToolId)" @click="runDialogVisible=false">取消</el-button><el-button type="primary" :loading="Boolean(launchingToolId)" @click="confirmRun">启动自动处理</el-button></div></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AsyncStateNotice from '@/components/AsyncStateNotice.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRight,
  BadgeDollarSign,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Download,
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
import { getTools } from '@/utils/api'
import { showToast } from '@/utils'
import { useAppStore } from '@/stores/app'
import { usePlatformStore } from '@/stores/platform'
import { readStoredLicense } from '@/features/user/model'
import {
  errorMessage,
  toolCatalogItemSchema,
  toolCatalogSchema,
  type ToolCatalogItem,
} from '@/features/tools/model'
import { buildDemoLaunch, buildLiveLaunch, isLiveTool } from '@/features/automation/launch'
import { getRuntimeCapabilities } from '@/runtime/capabilities'
import { downloadDesktopInstaller } from '@/runtime/desktop-download'

const router = useRouter() || { push: () => {} }
const route = useRoute() || { query: {} }
const appStore = useAppStore()
const platformStore = usePlatformStore()
const tools = ref<ToolCatalogItem[]>([])
const loading = ref(true)
const loadError = ref('')
const staleError = ref('')
const launchingToolId = ref<string | number | null>(null)
const detailsVisible = ref(false)
const detailsTool = ref<ToolCatalogItem | null>(null)
const runDialogVisible = ref(false)
const pendingTool = ref<ToolCatalogItem | null>(null)
const runInput = ref<Record<string, string | number | undefined>>({})
const runtime = getRuntimeCapabilities()

function numberInput(key: string): number | undefined {
  const value = runInput.value[key]
  return typeof value === 'number' ? value : undefined
}

function setNumberInput(key: string, value: number | null | undefined): void {
  runInput.value[key] = value ?? undefined
}

const userInfo = computed(() => {
  try {
    return readStoredLicense()
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

function toolIcon(tool: ToolCatalogItem) {
  return (tool.capability_key ? iconMap[tool.capability_key as keyof typeof iconMap] : undefined) || (tool.category === 'automation' ? Zap : Boxes)
}

function defaultDescription(tool: ToolCatalogItem) {
  return `自动处理${tool.name || '当前功能'}中的重复操作`
}

function normalizedList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(/[\n,，]/).map(item => item.trim()).filter(Boolean)
  return []
}

function toolCapabilities(tool: ToolCatalogItem) {
  return normalizedList(tool?.capability_tags).slice(0, 3)
}

function toolPlatformLabel(tool: ToolCatalogItem): string {
  const key = String(tool.platform_key || platformStore.currentPlatform || 'amazon').toLowerCase()
  return key === 'aliexpress' ? '速卖通' : '亚马逊'
}

function toolInputCount(tool: ToolCatalogItem): number {
  return Array.isArray(tool.single_input_schema) ? tool.single_input_schema.length : 0
}

function hasToolDetails(tool: ToolCatalogItem) {
  return toolCapabilities(tool).length
    || normalizedList(tool?.preparation_notes).length
    || normalizedList(tool?.intervention_scenarios).length
}

function liveUnavailable(tool: ToolCatalogItem): boolean {
  return isLiveTool(tool) && !runtime.singleLive
}

function openDetails(rawTool: unknown) {
  detailsTool.value = toolCatalogItemSchema.parse(rawTool)
  detailsVisible.value = true
}

const detailsActionText = computed(() => {
  if (!detailsTool.value) return '关闭'
  if (toolState(detailsTool.value) === 'locked') return '查看可用套餐'
  if (toolState(detailsTool.value) === 'maintenance') return '当前维护中'
  if (liveUnavailable(detailsTool.value)) return '下载 KST 桌面端'
  return isLiveTool(detailsTool.value) ? '填写参数并执行' : '开始交互演示'
})

async function launchFromDetails() {
  if (!detailsTool.value || toolState(detailsTool.value) === 'maintenance') return
  const tool = detailsTool.value
  detailsVisible.value = false
  if (liveUnavailable(tool)) {
    await downloadKstDesktop()
    return
  }
  handleToolClick(tool)
}

async function downloadKstDesktop(): Promise<void> {
  try {
    await downloadDesktopInstaller()
  } catch (error) {
    showToast(errorMessage(error, '桌面安装包暂时无法下载'), 'error')
  }
}

function toolState(tool: ToolCatalogItem) {
  const releaseStatus = tool.release_status || (tool.status === 'online' ? 'available' : tool.status) || 'maintenance'
  if (!['available', 'beta', 'online'].includes(releaseStatus)) return 'maintenance'
  const availablePlans = Array.isArray(tool.available_plans)
    ? tool.available_plans.map(item => String(item).toUpperCase())
    : []
  if (availablePlans.length && currentPlanCode.value && !availablePlans.includes(currentPlanCode.value)) return 'locked'
  return 'available'
}

function handleToolClick(rawTool: unknown) {
  const tool = toolCatalogItemSchema.parse(rawTool)
  const state = toolState(tool)
  if (state === 'locked') {
    router.push({ path: '/user/plans', query: { tool: tool.id } })
    return
  }
  if (state === 'maintenance') return
  if (liveUnavailable(tool)) {
    void downloadKstDesktop()
    return
  }
  if (isLiveTool(tool) && tool.single_input_schema?.length) {
    pendingTool.value = tool
    runInput.value = Object.fromEntries(tool.single_input_schema.map(field => [field.key, undefined]))
    runDialogVisible.value = true
    return
  }
  void runTool(tool)
}

async function loadData() {
  const hadData = tools.value.length > 0
  loading.value = !hadData
  loadError.value = ''
  staleError.value = ''
  try {
    tools.value = toolCatalogSchema
      .parse(await getTools({ platform_key: platformStore.currentPlatform }))
      .filter(tool => tool.supports_demo_single || tool.supports_live_single)
  } catch (error) {
    const message = errorMessage(error, '请检查网络连接后重试。')
    if (hadData) staleError.value = message
    else loadError.value = message
  } finally {
    loading.value = false
  }
}

async function confirmRun() {
  const tool = pendingTool.value
  if (!tool) return
  const missing = (tool.single_input_schema || []).find(field => field.required && (runInput.value[field.key] === undefined || runInput.value[field.key] === ''))
  if (missing) { showToast(`请填写${missing.label}`, 'warning'); return }
  await runTool(tool, { ...runInput.value })
  if (appStore.toolVisible) runDialogVisible.value = false
}

async function runTool(tool: ToolCatalogItem, input: Record<string, unknown> = {}) {
  if (launchingToolId.value !== null) return
  launchingToolId.value = tool.id
  try {
    const platformKey = platformStore.currentPlatform
    if (isLiveTool(tool) && !runtime.singleLive) throw new Error('真实自动化仅支持已启用本地 Runner 的桌面客户端')
    const launchTool = isLiveTool(tool)
      ? await buildLiveLaunch(tool, platformKey, input)
      : buildDemoLaunch(tool, platformKey, input)
    appStore.openTool(launchTool)
  } catch (error) {
    showToast(errorMessage(error, '工具启动失败，请稍后重试'), 'error')
  } finally {
    launchingToolId.value = null
  }
}

watch(() => platformStore.currentPlatform, () => {
  tools.value = []
  void loadData()
})
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

.state-badge.demo {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.state-badge.live { color: var(--color-success); background: var(--color-success-soft); }
.run-dialog-heading small { color: var(--color-success); font-size: var(--type-micro); font-weight: 800; letter-spacing: .12em; }
.run-dialog-heading h3 { margin: 5px 0 0; color: var(--color-text); }
.run-dialog-heading p { margin: 5px 0 0; color: var(--color-text-secondary); font-size: var(--type-meta); }
.run-form :deep(.el-input-number), .run-form :deep(.el-select) { width: 100%; }
.run-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

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
.tool-operational-meta{display:grid!important;grid-template-columns:.8fr .7fr 1.35fr;gap:6px;margin-top:14px;padding-top:12px;border-top:1px solid var(--color-border)}.tool-operational-meta>span{display:grid!important;gap:3px}.tool-operational-meta small{color:var(--color-text-tertiary);font-size:10px}.tool-operational-meta b{overflow:hidden;color:var(--color-text);font-size:var(--type-micro);font-weight:700;text-overflow:ellipsis;white-space:nowrap}

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

.empty-state button {
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  color: var(--color-primary);
  background: var(--color-surface);
  font-weight: 700;
  cursor: pointer;
}

.error-state > svg { color: var(--color-danger); }

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
