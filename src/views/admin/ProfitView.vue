<template>
  <div>
    <h2 style="font-family: var(--font-heading); font-size: 1.5rem; color: var(--color-primary); margin-bottom: 1.5rem;">
      分润管理
    </h2>

    <!-- 分润统计卡片 -->
    <section class="stats-row">
      <article class="stat-card" v-for="(item, index) in profitItems" :key="item.key">
        <div class="stat-icon" :style="{ background: item.bgColor }">
          <span style="font-size: 1.5rem;">{{ item.icon }}</span>
        </div>
        <div class="stat-content">
          <div class="stat-label">{{ item.label }} ({{ profitRatios[item.key] }}%)</div>
          <div class="stat-value" :style="{ color: item.color }">
            ¥{{ summary[item.amountKey]?.toFixed(2) || '0.00' }}
          </div>
        </div>
      </article>
    </section>

    <!-- 分润总计 -->
    <section class="total-card">
      <div class="total-content">
        <div class="total-label">分润总计</div>
        <div class="total-value">¥{{ summary.grand_total?.toFixed(2) || '0.00' }}</div>
      </div>
      <div v-if="!summary.grand_total" class="total-empty">
        暂无分润记录，请先创建订单并确认付款
      </div>
    </section>

    <!-- 分润比例可视化 -->
    <section class="table-card">
      <div class="table-header">
        <h3>分润比例配置</h3>
        <router-link to="/admin/settings" class="settings-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          去设置
        </router-link>
      </div>
      <div class="ratio-bars">
        <div v-for="item in profitItems" :key="item.key" class="ratio-bar-row">
          <div class="ratio-bar-label">
            <span class="ratio-bar-icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </div>
          <div class="ratio-bar-track">
            <div class="ratio-bar-fill" :style="{ width: profitRatios[item.key] + '%', background: item.barColor }"></div>
          </div>
          <div class="ratio-bar-value">{{ profitRatios[item.key] }}%</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getProfitSummary, getSettings } from '@/utils/api'
import { showToast } from '@/utils'

const summary = ref({})
const profitRatios = ref({
  tech: 30,
  market: 25,
  product: 15,
  service: 15,
  coordination: 10,
  record: 5
})

const profitItems = computed(() => [
  { key: 'tech', label: '技术', icon: '🔧', amountKey: 'total_tech', color: '#6366F1', bgColor: 'rgba(99,102,241,0.1)', barColor: '#6366F1' },
  { key: 'market', label: '市场', icon: '📢', amountKey: 'total_market', color: '#10B981', bgColor: 'rgba(16,185,129,0.1)', barColor: '#10B981' },
  { key: 'product', label: '产品', icon: '📦', amountKey: 'total_product', color: '#F59E0B', bgColor: 'rgba(245,158,11,0.1)', barColor: '#F59E0B' },
  { key: 'service', label: '客服', icon: '🎧', amountKey: 'total_service', color: '#EC4899', bgColor: 'rgba(236,72,153,0.1)', barColor: '#EC4899' },
  { key: 'coordination', label: '统筹', icon: '📋', amountKey: 'total_coordination', color: '#8B5CF6', bgColor: 'rgba(139,92,246,0.1)', barColor: '#8B5CF6' },
  { key: 'record', label: '记录', icon: '📝', amountKey: 'total_record', color: '#D97706', bgColor: 'rgba(217,119,6,0.1)', barColor: '#D97706' }
])

async function loadData() {
  try {
    const [summaryRes, settingsRes] = await Promise.all([
      getProfitSummary(),
      getSettings()
    ])
    summary.value = summaryRes
    
    const profitSetting = settingsRes.find(s => s.key === 'profit_ratios')
    if (profitSetting && profitSetting.value) {
      try {
        const ratios = JSON.parse(profitSetting.value)
        profitRatios.value = { ...profitRatios.value, ...ratios }
      } catch (e) {
        // 使用默认值
      }
    }
  } catch (err) {
    showToast('数据加载失败', 'error')
  }
}

onMounted(loadData)
</script>

<style scoped>
.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: white;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  transition: box-shadow var(--transition), transform var(--transition);
}

.stat-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  transform: translateY(-2px);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--color-muted);
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.2;
}

.total-card {
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-light));
  border-radius: 20px;
  padding: 2rem;
  margin-bottom: 1.5rem;
  text-align: center;
  color: white;
}

.total-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.total-label {
  font-size: 0.9rem;
  opacity: 0.9;
  font-weight: 500;
}

.total-value {
  font-size: 2.5rem;
  font-weight: 800;
  font-family: var(--font-heading);
}

.total-empty {
  margin-top: 1rem;
  font-size: 0.85rem;
  opacity: 0.8;
}

.table-card {
  background: white;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  padding: 1.25rem;
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
}

.table-header h3 {
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-primary);
  margin: 0;
}

.settings-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--color-accent);
  text-decoration: none;
  padding: 0.4rem 0.75rem;
  border-radius: 8px;
  background: rgba(99,102,241,0.08);
  transition: background var(--transition);
}

.settings-link:hover {
  background: rgba(99,102,241,0.15);
}

.ratio-bars {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ratio-bar-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.ratio-bar-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 80px;
  font-size: 0.85rem;
  color: var(--color-foreground);
  font-weight: 500;
}

.ratio-bar-icon {
  font-size: 1rem;
}

.ratio-bar-track {
  flex: 1;
  height: 8px;
  background: #F1F5F9;
  border-radius: 4px;
  overflow: hidden;
}

.ratio-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.ratio-bar-value {
  min-width: 40px;
  text-align: right;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-muted);
}

@media (max-width: 768px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .total-value {
    font-size: 2rem;
  }
}
</style>