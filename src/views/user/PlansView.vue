<template>
  <div class="plans-page">
    <header class="plans-header">
      <div><span class="plans-eyebrow">授权方案</span><h2>套餐与授权</h2><p>先确认需要使用的工具，再选择包含对应能力的套餐。</p></div>
      <div class="current-plan"><ShieldCheck :size="16" /><span>当前套餐</span><strong>{{ currentPlanName }}</strong></div>
    </header>

    <div v-if="route.query?.tool" class="upgrade-notice">
      <LockKeyhole :size="17" />当前套餐暂未包含你选择的工具，可查看下面的可用套餐。
    </div>

    <div v-if="plans.length" :class="['plans-grid', `plans-grid--count-${plans.length}`]">
      <article
        v-for="plan in plans"
        :key="plan.id"
        :class="['plan-card', { featured: plan.is_recommended, current: isCurrent(plan), anchor: plan.plan_code === 'Y999' }]"
      >
        <div class="plan-topline">
          <span v-if="plan.display_badge" class="plan-badge">{{ plan.display_badge }}</span>
          <span v-if="isCurrent(plan)" class="current-badge">当前使用</span>
        </div>
        <h3>{{ cleanPlanName(plan.name) }}</h3>
        <div class="plan-price"><small>¥</small><strong>{{ formatPrice(plan.price) }}</strong></div>
        <div class="plan-duration">{{ plan.duration_label || `${plan.duration_days} 天` }}</div>
        <ul>
          <li v-for="benefit in benefitsOf(plan)" :key="benefit"><Check :size="15" />{{ benefit }}</li>
        </ul>
        <button v-if="isCurrent(plan)" type="button" disabled>当前套餐</button>
        <button v-else type="button" @click="contactService(plan)">联系客服购买</button>
      </article>
    </div>

    <div v-else class="empty-state">暂无套餐信息</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Check, LockKeyhole, ShieldCheck } from '@lucide/vue'
import { getPlans } from '@/utils/api'
import { showToast } from '@/utils'
import { customerPlanListSchema, readStoredLicense, type CustomerPlan } from '@/features/user/model'

const route = useRoute() || { query: {} }
const plans = ref<CustomerPlan[]>([])
const userInfo = computed(readStoredLicense)
const currentPlanName = computed(() => userInfo.value.plan_name || '当前授权')
const currentPlanCode = computed(() => userInfo.value.plan_code || userInfo.value.plan_name?.match(/Y\d+/i)?.[0]?.toUpperCase() || '')

function cleanPlanName(name = ''): string {
  return name.replace(/^Y\d+\s*/i, '') || name
}

function formatPrice(price: string | number): string | number {
  const value = Number(price || 0)
  return Number.isInteger(value) ? value : value.toFixed(2)
}

function isCurrent(plan: CustomerPlan): boolean {
  return Boolean(currentPlanCode.value && plan.plan_code === currentPlanCode.value)
}

function benefitsOf(plan: CustomerPlan): string[] {
  if (Array.isArray(plan.benefits) && plan.benefits.length) return plan.benefits
  if (!plan.features) return ['基础工具权限']
  return String(plan.features).split(/[+\n]/).map(item => item.trim()).filter(Boolean)
}

function contactService(plan: CustomerPlan) {
  showToast(`购买 ${cleanPlanName(plan.name)}：请联系客服 AmazonToolbox_Support`, 'info')
}

async function loadPlans() {
  try {
    plans.value = customerPlanListSchema.parse(await getPlans()).filter(plan => plan.status === 'active')
  } catch (error) {
    showToast('套餐加载失败', 'error')
  }
}

onMounted(loadPlans)
</script>

<style scoped>
.plans-page { width: min(1180px, 100%); margin: 0 auto; }
.plans-eyebrow { display: block; margin-bottom: 8px; color: var(--color-premium); font-size:var(--type-meta); font-weight: 800; letter-spacing: .12em; }
.plans-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.plans-header h2 { margin: 0; color: var(--color-text); font-size: var(--type-page); letter-spacing: -.03em; }
.plans-header p { margin: 7px 0 0; color: var(--color-text-secondary); font-size: 13px; }
.current-plan { display: grid; grid-template-columns: auto auto; align-items: center; gap: 2px 7px; padding: 10px 13px; border: 1px solid rgba(169,133,82,.22); border-radius: var(--radius-md); color: var(--color-premium); background: var(--color-premium-soft); }
.current-plan span { color: var(--color-text-secondary); font-size:var(--type-micro); }
.current-plan strong { grid-column: 2; color: var(--color-text); font-size:var(--type-control); }
.upgrade-notice { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; padding: 12px 14px; border: 1px solid rgba(183,121,31,.2); border-radius: var(--radius-md); color: var(--color-warning); background: var(--color-warning-soft); font-size:var(--type-control); }
.plans-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
.plans-grid--count-1 { grid-template-columns: minmax(0, 1fr); max-width: 520px; }
.plans-grid--count-2, .plans-grid--count-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 1060px) { .plans-grid--count-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.plan-card { position: relative; min-height: 390px; display: flex; flex-direction: column; padding: 20px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: white; box-shadow: var(--shadow-low); }
.plan-card.featured { transform: translateY(-4px); border-color: rgba(169,133,82,.48); box-shadow: 0 16px 36px rgba(169,133,82,.1); }
.plan-card.current { border-color: var(--color-primary-muted); }
.plan-card.anchor { background: var(--color-surface-premium); }
.plan-topline { min-height: 24px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.plan-badge, .current-badge { padding: 4px 7px; border-radius: 999px; font-size:var(--type-micro); font-weight: 800; }
.plan-badge { color: white; background: var(--color-premium); }
.current-badge { color: var(--color-primary-hover); background: var(--color-primary-soft); }
.plan-card h3 { margin: 16px 0 8px; color: var(--color-text); font-size: 17px; }
.plan-price { display: flex; align-items: flex-start; color: var(--color-text); }
.plan-price small { margin-top: 7px; font-size: 14px; }
.plan-price strong { font-size: 34px; line-height: 1.1; }
.plan-duration { margin-top: 5px; color: var(--color-text-secondary); font-size:var(--type-meta); }
.plan-card ul { flex: 1; margin: 20px 0; padding: 16px 0 0; border-top: 1px solid var(--color-border); list-style: none; }
.plan-card li { display: flex; align-items: flex-start; gap: 7px; margin-bottom: 11px; color: var(--color-text); font-size:var(--type-control); line-height: 1.5; }
.plan-card li svg { flex-shrink: 0; margin-top: 1px; color: var(--color-success); }
.plan-card button { width: 100%; min-height: 40px; border: 0; border-radius: 8px; color: white; background: var(--color-primary); font-size:var(--type-control); font-weight: 800; cursor: pointer; }
.featured button, .anchor button { background: var(--color-primary); }
.plan-card button:disabled { color: var(--color-text-secondary); background: var(--color-surface-soft); cursor: default; }
.empty-state { padding: 80px; color: var(--color-text-secondary); text-align: center; }
@media (max-width: 1050px) { .plan-card.featured { transform: none; } }
@media (max-width: 759px) { .plans-header { flex-direction: column; } .plans-grid { grid-template-columns: 1fr; } }
</style>
