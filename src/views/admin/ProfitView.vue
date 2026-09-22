<template>
  <div class="profit-page">
    <PageHeader title="分润管理" description="查看当前有效分润总额与各角色的分配构成" />
    <AsyncStateNotice
      :state="loadState"
      :message="loadError"
      loading-text="正在加载分润数据…"
      @retry="loadData"
    />

    <template v-if="loadState !== 'loading' && loadState !== 'error'">
      <section class="profit-summary" aria-label="有效分润汇总">
        <div class="profit-summary__primary">
          <span>有效分润总额</span>
          <strong>¥{{ formatMoney(summary.grand_total) }}</strong>
          <p>仅统计已收款且尚未冲正的订单。</p>
        </div>
        <dl class="profit-summary__meta">
          <div>
            <dt>统计范围</dt>
            <dd>{{ platformLabel }}</dd>
          </div>
          <div>
            <dt>计算依据</dt>
            <dd>每笔收款时快照</dd>
          </div>
        </dl>
      </section>

      <el-card class="distribution-card" shadow="never">
        <template #header>
          <div class="distribution-header">
            <div>
              <h3>历史有效分润构成</h3>
              <p>占比按当前有效分润金额计算，不随策略编辑重算历史订单。</p>
            </div>
            <router-link v-if="canEditPolicy" to="/admin/settings" class="settings-link">编辑比例</router-link>
          </div>
        </template>

        <div class="distribution-grid">
          <article v-for="item in profitItems" :key="item.key" class="distribution-item">
            <div class="distribution-item__header">
              <span>{{ item.label }}</span>
              <span>{{ historicalRatio(item.amountKey) }}%</span>
            </div>
            <strong>¥{{ formatMoney(summary[item.amountKey]) }}</strong>
            <div class="ratio-track" aria-hidden="true">
              <span :style="{ width: `${historicalRatio(item.amountKey)}%` }" />
            </div>
          </article>
        </div>

        <div v-if="summary.grand_total === 0" class="profit-empty">
          暂无有效分润记录。订单标记为已收款后，系统会按当时的策略生成分润。
        </div>
      </el-card>
      <section class="current-policy" aria-label="当前分润策略">
        <h3>当前策略 V{{ policyVersion }}</h3>
        <p>仅用于后续收款订单，与上方历史金额占比不同。</p>
        <div><span v-for="item in profitItems" :key="item.key">{{ item.label }} {{ profitRatios[item.key] }}%</span></div>
      </section>
      <el-card class="ledger-card" shadow="never">
        <template #header>
          <div class="distribution-header">
            <div><h3>分润明细</h3><p>共 {{ recordTotal }} 笔 · 含已冲正记录，保留原成交快照。</p></div>
            <el-select v-model="recordStatus" aria-label="分润状态" style="width: 132px">
              <el-option label="全部状态" value="" /><el-option label="有效" value="active" /><el-option label="已冲正" value="reversed" />
            </el-select>
          </div>
        </template>
        <AsyncStateNotice :state="recordState" :message="recordError" loading-text="正在加载分润明细…" @retry="loadRecords" />
        <el-table v-if="recordState !== 'error' && recordState !== 'loading'" :data="records" stripe>
          <el-table-column prop="order_id" label="关联订单" width="100" />
          <el-table-column label="收款金额" width="120"><template #default="{ row }">¥{{ formatMoney(row.order_amount_snapshot) }}</template></el-table-column>
          <el-table-column prop="policy_version" label="策略版本" width="100" />
          <el-table-column v-for="item in profitItems" :key="item.key" :label="item.label" width="100"><template #default="{ row }">¥{{ formatMoney(row[`${item.key}_share`]) }}</template></el-table-column>
          <el-table-column label="状态" min-width="160"><template #default="{ row }">{{ row.status === 'reversed' ? '已冲正' : '有效' }}<small v-if="row.reversal_reason"> · {{ row.reversal_reason }}</small></template></el-table-column>
        </el-table>
        <div class="ledger-pagination"><el-pagination :current-page="recordPage" :page-size="20" :total="recordTotal" :pager-count="5" layout="prev, pager, next" @current-change="changeRecordPage" /></div>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { getProfitPage, getProfitPolicy, getProfitSummary } from '@/utils/api'
import { usePlatformStore } from '@/stores/platform'
import { authService } from '@/utils/auth'
import { profitPolicySchema, profitRecordSchema, profitSummarySchema, type ProfitRecord } from '@/features/admin/model'
import { hasStaffPermission } from '@/features/auth/permissions'
import { failedDataState, type AsyncDataState } from '@/features/async/state'
import AsyncStateNotice from '@/components/AsyncStateNotice.vue'
import PageHeader from '@/components/PageHeader.vue'

type ProfitKey = 'tech' | 'market' | 'product' | 'service' | 'coordination' | 'record'
type ProfitAmountKey = 'total_tech' | 'total_market' | 'total_product' | 'total_service' | 'total_coordination' | 'total_record'

interface ProfitItem {
  key: ProfitKey
  label: string
  amountKey: ProfitAmountKey
}

const summary = ref(profitSummarySchema.parse({}))
const loadState = ref<AsyncDataState>('loading')
const loadError = ref('')
const hasLoaded = ref(false)
const records = ref<ProfitRecord[]>([])
const recordPage = ref(1)
const recordTotal = ref(0)
const recordStatus = ref('')
const recordState = ref<AsyncDataState>('loading')
const recordError = ref('')
let loadSequence = 0
let recordSequence = 0
const policyVersion = ref(1)
const profitRatios = ref<Record<ProfitKey, number>>({
  tech: 30,
  market: 25,
  product: 15,
  service: 15,
  coordination: 10,
  record: 5,
})

const platformStore = usePlatformStore()
const canEditPolicy = computed(() => hasStaffPermission(authService.getRole(), 'profit.policy.write'))
const platformLabel = computed(() => {
  if (platformStore.adminPlatform === 'amazon') return '亚马逊'
  if (platformStore.adminPlatform === 'aliexpress') return '速卖通'
  return '全部平台'
})
const profitItems: ProfitItem[] = [
  { key: 'tech', label: '技术', amountKey: 'total_tech' },
  { key: 'market', label: '市场', amountKey: 'total_market' },
  { key: 'product', label: '产品', amountKey: 'total_product' },
  { key: 'service', label: '客服', amountKey: 'total_service' },
  { key: 'coordination', label: '统筹', amountKey: 'total_coordination' },
  { key: 'record', label: '记录', amountKey: 'total_record' },
]

function formatMoney(value: number | null | undefined): string {
  return Number(value || 0).toFixed(2)
}

function historicalRatio(key: ProfitAmountKey): string {
  return summary.value.grand_total > 0 ? (summary.value[key] / summary.value.grand_total * 100).toFixed(1) : '0.0'
}

async function loadRecords() {
  const sequence = ++recordSequence
  recordState.value = records.value.length ? 'data' : 'loading'
  recordError.value = ''
  try {
    const response = await getProfitPage({ page: recordPage.value, page_size: 20, status: recordStatus.value || undefined, platform_key: platformStore.adminPlatform === 'all' ? undefined : platformStore.adminPlatform })
    if (sequence !== recordSequence) return
    records.value = response.items.map(item => profitRecordSchema.parse(item))
    recordTotal.value = response.total
    recordState.value = records.value.length ? 'data' : 'empty'
  } catch (error) {
    if (sequence !== recordSequence) return
    recordError.value = error instanceof Error ? error.message : '分润明细加载失败'
    recordState.value = failedDataState(records.value.length > 0)
  }
}

function changeRecordPage(page: number) {
  recordPage.value = page
  void loadRecords()
}

async function loadData() {
  const sequence = ++loadSequence
  loadState.value = hasLoaded.value ? 'data' : 'loading'
  loadError.value = ''
  try {
    const platformKey = platformStore.adminPlatform !== 'all' ? platformStore.adminPlatform : undefined
    const params = platformKey ? { platform_key: platformKey } : {}
    const [summaryRes, policyRes] = await Promise.all([
      getProfitSummary(params),
      getProfitPolicy(),
    ])
    if (sequence !== loadSequence) return
    summary.value = profitSummarySchema.parse(summaryRes)

    const policy = profitPolicySchema.parse(policyRes)
    policyVersion.value = policy.version
    const ratioUpdate = Object.fromEntries(
      Object.entries(policy.ratios)
        .filter(([key, value]) => key in profitRatios.value && Number.isFinite(value))
        .map(([key, value]) => [key, Number((value * 100).toFixed(2))]),
    ) as Partial<Record<ProfitKey, number>>
    profitRatios.value = { ...profitRatios.value, ...ratioUpdate }
    hasLoaded.value = true
    loadState.value = summary.value.grand_total > 0 ? 'data' : 'empty'
  } catch (error) {
    if (sequence !== loadSequence) return
    loadError.value = error instanceof Error && error.message ? error.message : '分润汇总与策略暂时无法加载'
    loadState.value = failedDataState(hasLoaded.value)
  }
}

watch(() => platformStore.adminPlatform, () => { void loadData() })
watch([() => platformStore.adminPlatform, recordStatus], () => { recordPage.value = 1; void loadRecords() })
onMounted(() => { void loadData(); void loadRecords() })
onBeforeUnmount(() => { loadSequence += 1; recordSequence += 1 })
</script>

<style scoped>
.current-policy { margin: 20px 0; padding: 20px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.current-policy h3 { margin: 0; font-size: 1rem; }
.current-policy p { color: var(--color-text-secondary); font-size: .85rem; }
.current-policy > div { display: flex; gap: 16px; flex-wrap: wrap; font-size: .85rem; }
.ledger-pagination { margin-top: 16px; display: flex; justify-content: flex-end; overflow-x: auto; }
.profit-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 32px;
  align-items: center;
  margin-bottom: 20px;
  padding: 24px 28px;
  border: 1px solid rgba(45, 95, 202, 0.22);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(45, 95, 202, 0.08), rgba(45, 95, 202, 0.02));
}

.profit-summary__primary { display: grid; gap: 6px; }
.profit-summary__primary > span { color: var(--color-text-secondary); font-size: 0.85rem; font-weight: 600; }
.profit-summary__primary strong { color: var(--color-text); font-size: clamp(2rem, 4vw, 2.75rem); line-height: 1.1; letter-spacing: -0.035em; }
.profit-summary__primary p { margin: 2px 0 0; color: var(--color-text-secondary); font-size: 0.82rem; }

.profit-summary__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(112px, 1fr));
  gap: 12px;
  margin: 0;
}

.profit-summary__meta div { padding: 12px 14px; border-left: 1px solid var(--color-border); }
.profit-summary__meta dt { color: var(--color-text-secondary); font-size: 0.75rem; }
.profit-summary__meta dd { margin: 5px 0 0; color: var(--color-text); font-size: 0.95rem; font-weight: 700; }

.distribution-card { border-radius: var(--radius-lg); }
.distribution-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.distribution-header h3 { margin: 0; color: var(--color-text); font-size: 1rem; }
.distribution-header p { margin: 5px 0 0; color: var(--color-text-secondary); font-size: 0.8rem; }
.settings-link { color: var(--color-primary); font-size: 0.85rem; font-weight: 700; text-decoration: none; white-space: nowrap; }
.settings-link:hover { text-decoration: underline; }

.distribution-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid var(--color-border);
  border-left: 1px solid var(--color-border);
}

.distribution-item {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 20px;
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.distribution-item__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--color-text-secondary); font-size: 0.82rem; }
.distribution-item__header span:first-child { color: var(--color-text); font-weight: 700; }
.distribution-item strong { overflow-wrap: anywhere; color: var(--color-text); font-size: 1.45rem; line-height: 1.2; letter-spacing: -0.02em; }
.ratio-track { height: 5px; overflow: hidden; border-radius: 999px; background: var(--color-canvas); }
.ratio-track span { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); }
.profit-empty { margin-top: 18px; padding: 14px 16px; border-radius: var(--radius-md); color: var(--color-text-secondary); background: var(--color-surface-soft); font-size: 0.85rem; line-height: 1.6; }

@media (max-width: 720px) {
  .profit-summary { grid-template-columns: 1fr; gap: 20px; padding: 22px; }
  .profit-summary__meta { width: 100%; }
  .profit-summary__meta div:first-child { border-left: 0; padding-left: 0; }
}

@media (max-width: 1100px) {
  .distribution-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .profit-summary__meta { grid-template-columns: 1fr; }
  .profit-summary__meta div { border-left: 0; border-top: 1px solid var(--color-border); padding: 10px 0 0; }
  .distribution-header { align-items: flex-start; }
  .distribution-grid { grid-template-columns: 1fr; }
}
</style>
