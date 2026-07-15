<template>
  <div class="plans-page">
    <header class="plans-header">
      <div><h2>套餐与授权</h2><p>选择包含所需工具的套餐，购买后使用授权码登录。</p></div>
      <div class="current-plan"><ShieldCheck :size="16" /><span>当前套餐</span><strong>{{ currentPlanName }}</strong></div>
    </header>

    <div v-if="route.query?.tool" class="upgrade-notice">
      <LockKeyhole :size="17" />当前套餐暂未包含你选择的工具，可查看下面的可用套餐。
    </div>

    <div v-if="plans.length" class="plans-grid">
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

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Check, LockKeyhole, ShieldCheck } from '@lucide/vue'
import { getPlans } from '@/utils/api'
import { showToast } from '@/utils'

const route = useRoute() || { query: {} }
const plans = ref([])
const userInfo = computed(() => {
  try { return JSON.parse(localStorage.getItem('toolbox_user') || '{}') } catch { return {} }
})
const currentPlanName = computed(() => userInfo.value.plan_name || '当前授权')
const currentPlanCode = computed(() => userInfo.value.plan_code || userInfo.value.plan_name?.match(/Y\d+/i)?.[0]?.toUpperCase() || '')

function cleanPlanName(name = '') {
  return name.replace(/^Y\d+\s*/i, '') || name
}

function formatPrice(price) {
  const value = Number(price || 0)
  return Number.isInteger(value) ? value : value.toFixed(2)
}

function isCurrent(plan) {
  return Boolean(currentPlanCode.value && plan.plan_code === currentPlanCode.value)
}

function benefitsOf(plan) {
  if (Array.isArray(plan.benefits) && plan.benefits.length) return plan.benefits
  if (!plan.features) return ['基础工具权限']
  return String(plan.features).split(/[+\n]/).map(item => item.trim()).filter(Boolean)
}

function contactService(plan) {
  showToast(`购买 ${cleanPlanName(plan.name)}：请联系客服 AmazonToolbox_Support`, 'info')
}

async function loadPlans() {
  try {
    plans.value = (await getPlans()).filter(plan => plan.status === 'active')
  } catch (error) {
    showToast('套餐加载失败', 'error')
  }
}

onMounted(loadPlans)
</script>

<style scoped>
.plans-page { width: min(1180px, 100%); margin: 0 auto; }
.plans-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.plans-header h2 { margin: 0; color: var(--studio-text-main); font-size: 26px; }
.plans-header p { margin: 7px 0 0; color: var(--studio-text-muted); font-size: 13px; }
.current-plan { display: grid; grid-template-columns: auto auto; align-items: center; gap: 2px 7px; padding: 9px 12px; border: 1px solid var(--studio-border); border-radius: 9px; color: var(--studio-accent); background: white; }
.current-plan span { color: var(--studio-text-muted); font-size: 10px; }
.current-plan strong { grid-column: 2; color: var(--studio-text-main); font-size: 12px; }
.upgrade-notice { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; padding: 11px 13px; border: 1px solid rgba(255,153,0,.25); border-radius: 9px; color: #92400e; background: rgba(255,153,0,.08); font-size: 12px; }
.plans-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
.plan-card { position: relative; min-height: 390px; display: flex; flex-direction: column; padding: 20px; border: 1px solid var(--studio-border); border-radius: var(--radius-lg); background: white; box-shadow: var(--studio-shadow); }
.plan-card.featured { transform: translateY(-5px); border: 2px solid var(--studio-warning); box-shadow: 0 16px 36px rgba(255,153,0,.12); }
.plan-card.current { border-color: var(--studio-accent-light); }
.plan-card.anchor { background: linear-gradient(180deg, #fff 0%, #fffbeb 100%); }
.plan-topline { min-height: 24px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.plan-badge, .current-badge { padding: 4px 7px; border-radius: 999px; font-size: 10px; font-weight: 800; }
.plan-badge { color: white; background: var(--studio-warning); }
.current-badge { color: var(--studio-accent-hover); background: var(--studio-accent-bg); }
.plan-card h3 { margin: 16px 0 8px; color: var(--studio-text-main); font-size: 17px; }
.plan-price { display: flex; align-items: flex-start; color: var(--studio-text-main); }
.plan-price small { margin-top: 7px; font-size: 14px; }
.plan-price strong { font-size: 34px; line-height: 1.1; }
.plan-duration { margin-top: 5px; color: var(--studio-text-muted); font-size: 11px; }
.plan-card ul { flex: 1; margin: 20px 0; padding: 16px 0 0; border-top: 1px solid var(--studio-border); list-style: none; }
.plan-card li { display: flex; align-items: flex-start; gap: 7px; margin-bottom: 11px; color: var(--studio-text-main); font-size: 12px; line-height: 1.5; }
.plan-card li svg { flex-shrink: 0; margin-top: 1px; color: var(--studio-success); }
.plan-card button { width: 100%; min-height: 40px; border: 0; border-radius: 8px; color: white; background: var(--studio-accent); font-size: 12px; font-weight: 800; cursor: pointer; }
.featured button, .anchor button { background: var(--studio-warning); }
.plan-card button:disabled { color: var(--studio-text-muted); background: var(--studio-bg-hover); cursor: default; }
.empty-state { padding: 80px; color: var(--studio-text-muted); text-align: center; }
@media (max-width: 1050px) { .plans-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .plan-card.featured { transform: none; } }
@media (max-width: 620px) { .plans-header { flex-direction: column; } .plans-grid { grid-template-columns: 1fr; } }
</style>
