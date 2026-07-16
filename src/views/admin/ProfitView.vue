<template>
  <div>
    <h2 class="page-title">分润管理</h2>

    <!-- 分润统计卡片 -->
    <el-row :gutter="16" style="margin-bottom: 1.5rem; align-items: stretch;">
      <el-col :xs="12" :sm="8" :md="4" v-for="(item, index) in profitItems" :key="item.key" style="display: flex;">
        <el-card class="stat-card" style="width: 100%; min-height: 120px;">
          <div class="stat-icon" :style="{ background: item.bgColor }">
            <span style="font-size: 1.5rem;">{{ item.icon }}</span>
          </div>
          <div class="stat-content">
            <div class="stat-label">{{ item.label }} ({{ profitRatios[item.key] }}%)</div>
            <div class="stat-value" :style="{ color: item.color }">
              ¥{{ summary[item.amountKey]?.toFixed(2) || '0.00' }}
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 分润总计 -->
    <el-card class="total-card">
      <div class="total-content">
        <div class="total-label">分润总计</div>
        <div class="total-value">¥{{ summary.grand_total?.toFixed(2) || '0.00' }}</div>
      </div>
      <div v-if="!summary.grand_total" class="total-empty">
        暂无分润记录，请先创建订单并确认付款
      </div>
    </el-card>

    <!-- 分润比例可视化 -->
    <el-card class="table-card">
      <template #header>
        <div class="card-header">
          <h3>分润比例配置</h3>
          <router-link to="/admin/settings" class="settings-link">
            <el-icon><Setting /></el-icon>
            去设置
          </router-link>
        </div>
      </template>
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
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { getProfitSummary, getSettings } from '@/utils/api'
import { showToast } from '@/utils'
import { usePlatformStore } from '@/stores/platform'
import { Setting } from '@element-plus/icons-vue'
import { adminSettingsSchema, profitSummarySchema } from '@/features/admin/model'

type ProfitKey = 'tech' | 'market' | 'product' | 'service' | 'coordination' | 'record'
type ProfitAmountKey = 'total_tech' | 'total_market' | 'total_product' | 'total_service' | 'total_coordination' | 'total_record'
interface ProfitItem {
  key: ProfitKey
  label: string
  icon: string
  amountKey: ProfitAmountKey
  color: string
  bgColor: string
  barColor: string
}

const summary = ref(profitSummarySchema.parse({}))
const profitRatios = ref<Record<ProfitKey, number>>({
  tech: 30,
  market: 25,
  product: 15,
  service: 15,
  coordination: 10,
  record: 5
})

const platformStore = usePlatformStore()

const profitItems = computed<ProfitItem[]>(() => [
  { key: 'tech', label: '技术', icon: '🔧', amountKey: 'total_tech', color: '#6366F1', bgColor: 'rgba(99,102,241,0.1)', barColor: '#6366F1' },
  { key: 'market', label: '市场', icon: '📢', amountKey: 'total_market', color: '#10B981', bgColor: 'rgba(16,185,129,0.1)', barColor: '#10B981' },
  { key: 'product', label: '产品', icon: '📦', amountKey: 'total_product', color: '#F59E0B', bgColor: 'rgba(245,158,11,0.1)', barColor: '#F59E0B' },
  { key: 'service', label: '客服', icon: '🎧', amountKey: 'total_service', color: '#EC4899', bgColor: 'rgba(236,72,153,0.1)', barColor: '#EC4899' },
  { key: 'coordination', label: '统筹', icon: '📋', amountKey: 'total_coordination', color: '#8B5CF6', bgColor: 'rgba(139,92,246,0.1)', barColor: '#8B5CF6' },
  { key: 'record', label: '记录', icon: '📝', amountKey: 'total_record', color: '#D97706', bgColor: 'rgba(217,119,6,0.1)', barColor: '#D97706' }
])

async function loadData() {
  try {
    const platformKey = platformStore.adminPlatform !== 'all' ? platformStore.adminPlatform : undefined
    const params = platformKey ? { platform_key: platformKey } : {}
    const [summaryRes, settingsRes] = await Promise.all([
      getProfitSummary(params),
      getSettings()
    ])
    summary.value = profitSummarySchema.parse(summaryRes)
    
    const settings = adminSettingsSchema.parse(settingsRes)
    const profitSetting = settings.find((setting) => setting.key === 'profit_ratios')
    if (profitSetting && profitSetting.value) {
      try {
        const ratios = JSON.parse(profitSetting.value) as unknown
        const ratioUpdate = Object.fromEntries(
          Object.entries(typeof ratios === 'object' && ratios !== null ? ratios : {})
            .filter(([key, value]) => key in profitRatios.value && typeof value === 'number' && Number.isFinite(value)),
        ) as Partial<Record<ProfitKey, number>>
        profitRatios.value = { ...profitRatios.value, ...ratioUpdate }
      } catch (e) {
        // 使用默认值
      }
    }
  } catch (err) {
    showToast('数据加载失败', 'error')
  }
}

watch(() => platformStore.adminPlatform, () => { loadData() })

onMounted(loadData)
</script>

<style scoped>
.page-title {
  font-family: var(--font-family);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 1.5rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
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
  color: var(--color-text-secondary);
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.2;
}

.total-card {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-muted));
  margin-bottom: 1.5rem;
  text-align: center;
  color: white;
}

.total-card :deep(.el-card__body) {
  background: transparent;
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
  font-family: var(--font-family);
}

.total-empty {
  margin-top: 1rem;
  font-size: 0.85rem;
  opacity: 0.8;
}

.table-card {
  margin-bottom: 1.5rem;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header h3 {
  font-family: var(--font-family);
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.settings-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--color-primary);
  text-decoration: none;
  padding: 0.4rem 0.75rem;
  border-radius: 8px;
  background: rgba(79, 70, 229, 0.08);
  transition: background var(--transition);
}

.settings-link:hover {
  background: rgba(79, 70, 229, 0.15);
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
  color: var(--color-text);
  font-weight: 500;
}

.ratio-bar-icon {
  font-size: 1rem;
}

.ratio-bar-track {
  flex: 1;
  height: 8px;
  background: var(--color-canvas);
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
  color: var(--color-text-secondary);
}

@media (max-width: 768px) {
  .total-value {
    font-size: 2rem;
  }
}
</style>
