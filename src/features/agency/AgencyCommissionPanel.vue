<template>
  <section class="commission-panel" aria-label="代理返佣与月结">
    <div class="panel-heading"><div><h2>代理返佣与月结</h2><p>按已确认收款金额 × 代理比例计提；未设置比例不产生佣金。这里只登记线下结算，不会自动转账。</p></div><el-button :loading="loading || loadingAgencies" :disabled="savingRate || confirming" @click="refresh">刷新</el-button></div>
    <div v-if="listError || loadError" class="error-state" role="alert"><el-alert :title="listError || loadError" type="error" show-icon :closable="false" /><el-button :disabled="loading || loadingAgencies" @click="refresh">重新加载</el-button></div>
    <p v-if="loadingAgencies" role="status">正在加载代理列表…</p>
    <el-empty v-else-if="listReady && !agencies.length" description="暂无代理主体，请先在代理主体分区创建代理" />
    <template v-if="agencies.length">
      <div class="control-grid">
        <label for="commission-agency">代理主体<el-select id="commission-agency" v-model="agencyId" filterable placeholder="选择代理"><el-option v-for="agency in agencies" :key="agency.id" :label="agency.name" :value="agency.id" /></el-select></label>
        <div class="rate-control"><el-checkbox v-model="rateEnabled" :disabled="!policy || loading || savingRate">设置返佣比例</el-checkbox><el-input-number id="commission-rate" v-model="ratePercent" aria-label="返佣比例（百分比）" :min="0" :max="100" :precision="4" :step="0.5" placeholder="输入百分比" :disabled="!policy || !rateEnabled || loading || savingRate" /><small><span class="current-rate">{{ currentRateLabel }}</span>。改比例只影响之后确认收款的订单；取消勾选可恢复未设置。</small></div>
        <el-button type="primary" :disabled="!canSaveRate" :loading="savingRate" @click="saveRate">保存比例</el-button>
      </div>
      <el-alert v-if="rateError" :title="rateError" type="error" show-icon :closable="false" class="action-error" />
      <div class="summary-grid" :aria-busy="loading"><div><span>待月结</span><strong>{{ amountLabel(summary?.pending_amount) }}</strong></div><div><span>已月结</span><strong>{{ amountLabel(summary?.settled_amount) }}</strong></div><div><span>累计计提</span><strong>{{ amountLabel(summary?.accrued_amount) }}</strong></div><div><span>退款冲正</span><strong>{{ amountLabel(summary?.refunded_amount) }}</strong></div></div>
      <div class="settlement-card"><div class="section-title"><div><h3>登记线下月结</h3><p>预览包含截至所选月末仍未结算的记录。先在线下完成核对与付款，再由负责人登记；每个代理每月只能确认一次。</p></div></div>
        <div class="settlement-controls"><label for="commission-month">结算月份<input id="commission-month" v-model="month" type="month" /></label><el-button :loading="previewing" :disabled="!canPreview" @click="preview">{{ previewData ? '重新预览' : '预览结算' }}</el-button></div>
        <el-alert v-if="previewError" :title="previewError" type="error" show-icon :closable="false" /><p v-if="!validMonth" class="empty-hint">请选择有效的结算月份。</p><p v-else-if="!previewData && !previewing && !previewError" class="empty-hint">选择月份后预览，核对金额和记录数。</p>
        <div v-if="previewData" class="preview-row"><template v-if="previewData.existing_settlement"><div><span>{{ month }} 已登记线下结算</span><p>{{ previewData.existing_settlement.count }} 条记录 · {{ money(previewData.existing_settlement.amount) }}</p></div><el-tag type="success">已确认，不可重复登记</el-tag></template><template v-else><div><span>{{ previewData.count }} 条待结算记录</span><p v-if="previewData.count === 0">截至所选月末暂无待结算记录。</p><p v-else-if="previewData.amount <= 0">本次没有可确认的正向佣金，请核对退款冲正记录。</p></div><strong>{{ money(previewData.amount) }}</strong><el-button type="primary" :loading="confirming" :disabled="!canConfirm" @click="confirmSettlement">确认已线下结算</el-button></template></div>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { z } from 'zod'
import { showToast } from '@/utils'
import { agencyApi } from './api'
import { money, type Agency } from './model'
import { commissionMonthSchema, type CommissionPolicy, type CommissionSummary, type CommissionPreview } from './commission-model'
const agencies = ref<Agency[]>([]), agencyId = ref<number>(), loadingAgencies = ref(false), listReady = ref(false), listError = ref('')
const loading = ref(false), loadError = ref(''), savingRate = ref(false), rateError = ref(''), previewing = ref(false), previewError = ref(''), confirming = ref(false)
const policy = ref<CommissionPolicy>(), summary = ref<CommissionSummary>(), previewData = ref<CommissionPreview>(), rateEnabled = ref(false), ratePercent = ref<number>()
const now = new Date(), month = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
const validMonth = computed(() => commissionMonthSchema.safeParse(month.value).success), validPercent = computed(() => z.number().finite().min(0).max(100).safeParse(ratePercent.value).success)
const canSaveRate = computed(() => !!policy.value && !loading.value && !savingRate.value && (!rateEnabled.value || validPercent.value)), canPreview = computed(() => !!agencyId.value && validMonth.value && !previewing.value && !confirming.value), canConfirm = computed(() => !!previewData.value && !previewData.value.existing_settlement && previewData.value.count > 0 && previewData.value.amount > 0 && !previewing.value && !confirming.value)
const currentRateLabel = computed(() => !policy.value ? '当前比例尚未加载' : policy.value.rate === null ? '当前：未设置比例' : `当前：${Math.round(policy.value.rate * 1_000_000) / 10_000}%`)
let alive = true, scope = 0, loadRequest = 0, previewRequest = 0
const amountLabel = (value: number | undefined): string => value === undefined ? '—' : money(value)
const errorMessage = (cause: unknown, fallback: string): string => cause instanceof z.ZodError ? '返回数据格式异常，请刷新重试' : cause instanceof Error ? cause.message : fallback
const ownsScope = (agency: number, owner: number): boolean => alive && agencyId.value === agency && scope === owner
function applyPolicy(value: CommissionPolicy): void { policy.value = value; rateEnabled.value = value.rate !== null; ratePercent.value = value.rate === null ? undefined : Math.round(value.rate * 1_000_000) / 10_000 }
function clearPreview(): void { previewRequest++; previewData.value = undefined; previewError.value = ''; previewing.value = false }
async function load(): Promise<void> {
  const agency = agencyId.value; if (!agency) return; const owner = scope, request = ++loadRequest; const owns = () => ownsScope(agency, owner) && request === loadRequest
  loading.value = true; loadError.value = ''; rateError.value = ''; policy.value = undefined; summary.value = undefined; clearPreview()
  try { const [nextPolicy, nextSummary] = await Promise.all([agencyApi.commissionPolicy(agency), agencyApi.commissionSummary(agency)]); if (!owns()) return; if (nextPolicy.agency_id !== agency) throw new Error('返回的代理比例归属不一致，请重新加载'); applyPolicy(nextPolicy); summary.value = nextSummary } catch (cause) { if (owns()) loadError.value = errorMessage(cause, '返佣数据加载失败，请重新加载') } finally { if (owns()) loading.value = false }
}
async function loadAgencies(): Promise<void> {
  if (loadingAgencies.value) return; loadingAgencies.value = true; listError.value = ''
  try { const rows: Agency[] = []; let page = 1; while (alive) { const result = await agencyApi.agencies({ page, page_size: 100 }); if (!alive) return; rows.push(...result.data); if (rows.length >= result.total) break; if (!result.data.length) throw new Error('代理列表不完整，请重新加载'); page++ }; if (!alive) return; agencies.value = rows; listReady.value = true; agencyId.value = rows[0]?.id } catch (cause) { if (alive) listError.value = errorMessage(cause, '代理列表加载失败，请重新加载') } finally { if (alive) loadingAgencies.value = false }
}
async function refresh(): Promise<void> { if (savingRate.value || confirming.value) return; if (!listReady.value || listError.value || !agencies.value.length) await loadAgencies(); else await load() }
async function saveRate(): Promise<void> {
  const agency = agencyId.value, loadedPolicy = policy.value; if (!agency || !loadedPolicy || !canSaveRate.value) return; const owner = scope, expectedRate = loadedPolicy.rate, nextRate = rateEnabled.value ? Math.round(z.number().parse(ratePercent.value) * 10_000) / 1_000_000 : null
  savingRate.value = true; rateError.value = ''
  try { const saved = await agencyApi.updateCommissionPolicy(agency, nextRate, expectedRate); if (!ownsScope(agency, owner)) return; if (saved.agency_id !== agency) throw new Error('返回的代理比例归属不一致，请刷新核对'); applyPolicy(saved); showToast('返佣比例已保存；只影响之后确认收款的订单', 'success') } catch (cause) { if (ownsScope(agency, owner)) rateError.value = errorMessage(cause, '返佣比例保存失败，请刷新核对后重试') } finally { if (alive) savingRate.value = false }
}
async function preview(): Promise<void> {
  const agency = agencyId.value; if (!agency || !canPreview.value) return; const owner = scope, selectedMonth = month.value, request = ++previewRequest, owns = () => ownsScope(agency, owner) && month.value === selectedMonth && request === previewRequest
  previewing.value = true; previewData.value = undefined; previewError.value = ''
  try { const result = await agencyApi.commissionPreview(agency, selectedMonth); if (!owns()) return; if (result.agency_id !== agency || result.month !== selectedMonth) throw new Error('返回的月结归属不一致，请重新预览'); previewData.value = result } catch (cause) { if (owns()) previewError.value = errorMessage(cause, '月结预览失败，请重新预览') } finally { if (owns()) previewing.value = false }
}
async function confirmSettlement(): Promise<void> {
  const agency = agencyId.value, reviewed = previewData.value; if (!agency || !reviewed || !canConfirm.value) return; const owner = scope, owns = () => ownsScope(agency, owner) && previewData.value === reviewed && month.value === reviewed.month; confirming.value = true
  try {
    try { await ElMessageBox.confirm(`请确认已向「${agencies.value.find(item => item.id === agency)?.name ?? agency}」完成 ${reviewed.month} 的线下结算：${reviewed.count} 条记录，${money(reviewed.amount)}。这里只登记，不会自动转账，确认后该月份不能重复登记。`, '确认已完成线下结算', { type: 'warning', confirmButtonText: '已完成线下结算，登记', cancelButtonText: '返回核对', closeOnClickModal: false, closeOnPressEscape: false }) } catch { return }
    if (!owns()) return
    try { const saved = await agencyApi.confirmCommissionSettlement(agency, { month: reviewed.month, expected_revision: reviewed.revision, note: `负责人确认 ${reviewed.month} 线下结算` }); if (!owns()) return; if (saved.agency_id !== agency || saved.month !== reviewed.month) throw new Error('返回的结算归属不一致，请重新预览核对'); previewData.value = { ...reviewed, existing_settlement: saved }; showToast('已登记线下结算，不会自动转账', 'success'); try { const updated = await agencyApi.commissionSummary(agency); if (ownsScope(agency, owner)) summary.value = updated } catch { if (ownsScope(agency, owner)) loadError.value = '结算已登记，汇总刷新失败，请刷新核对' } } catch (cause) { if (owns()) { clearPreview(); previewError.value = `${errorMessage(cause, '月结确认失败')}；请重新预览核对后再操作。` } }
  } finally { if (alive) confirming.value = false }
}
watch(agencyId, () => { scope++; policy.value = undefined; summary.value = undefined; rateEnabled.value = false; ratePercent.value = undefined; clearPreview(); void load() }, { flush: 'sync' })
watch(month, clearPreview, { flush: 'sync' })
onMounted(() => { void loadAgencies() }); onBeforeUnmount(() => { alive = false; scope++; loadRequest++; previewRequest++ })
</script>
<style scoped>
.commission-panel{padding-bottom:40px;min-width:0}.panel-heading,.section-title{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.panel-heading h2{margin:0;font-size:22px}.panel-heading p,.section-title p{color:var(--color-text-secondary);font-size:13px;line-height:1.7}.control-grid{display:grid;grid-template-columns:minmax(180px,1fr) minmax(240px,1.4fr) auto;align-items:center;gap:18px;margin:24px 0;padding:20px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface)}label,.rate-control{display:flex;flex-direction:column;gap:7px;color:var(--color-text);font-size:13px}.control-grid :deep(.el-select),.control-grid :deep(.el-input-number){width:100%}small{color:var(--color-text-secondary);font-size:12px;line-height:1.7;font-weight:400}.summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:24px}.summary-grid div{display:flex;flex-direction:column;gap:7px;padding:18px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface)}.summary-grid span{color:var(--color-text-secondary);font-size:12px}.summary-grid strong{color:var(--color-text);font-size:20px;overflow-wrap:anywhere}.settlement-card{padding:20px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface)}.section-title h3{margin:0}.settlement-controls{display:flex;align-items:end;gap:16px;margin:12px 0 18px}.settlement-controls input{box-sizing:border-box;min-height:34px;padding:5px 10px;border:1px solid var(--color-border);border-radius:6px;color:var(--color-text);background:var(--color-surface);font:inherit}.empty-hint,.preview-row p{color:var(--color-text-secondary);font-size:13px;line-height:1.7}.preview-row{display:flex;align-items:center;gap:24px;margin-top:18px;padding-top:18px;border-top:1px solid var(--color-border)}.preview-row strong{margin-right:auto;font-size:20px}.error-state{display:flex;gap:12px;align-items:center;margin:16px 0}.error-state :deep(.el-alert){flex:1}.action-error{margin-bottom:20px}@media(max-width:760px){.control-grid{grid-template-columns:1fr}.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.panel-heading,.section-title{flex-direction:column}.preview-row{align-items:flex-start;flex-wrap:wrap}.error-state{align-items:stretch;flex-direction:column}}@media(max-width:380px){.summary-grid{grid-template-columns:1fr}}
</style>
