<template>
  <div>
    <h2 class="page-title">套餐价格</h2>
    <div v-if="plans.length" class="plans-grid">
      <el-card
        v-for="(plan, index) in plans"
        :key="plan.id"
        class="plan-card"
        :class="{ featured: isRecommended(plan) }"
        shadow="hover"
      >
        <!-- 推荐标签 -->
        <el-tag
          v-if="isRecommended(plan)"
          type="warning"
          effect="dark"
          size="small"
          class="recommend-tag"
        >
          🔥 推荐
        </el-tag>
        <!-- SVIP 标识 -->
        <div v-if="plan.code_prefix" class="svip-badge">
          {{ plan.code_prefix }}
        </div>
        <div class="plan-name">{{ plan.name }}</div>
        <div class="plan-price" :style="{ color: priceColor(index) }">
          ¥{{ plan.price }}
        </div>
        <div class="plan-duration">{{ plan.duration_days }} 天有效期</div>
        <!-- 授权码前缀展示 -->
        <div v-if="plan.code_prefix" class="code-prefix-info">
          授权码前缀: <strong>{{ plan.code_prefix }}</strong>
        </div>
        <ul class="plan-features">
          <li v-for="(feature, i) in getFeatures(plan.features)" :key="i">
            <Check :size="14" />
            {{ feature }}
          </li>
        </ul>
        <el-button
          :type="isRecommended(plan) ? 'warning' : 'primary'"
          style="width: 100%;"
          @click="contactService"
        >
          联系客服购买
        </el-button>
      </el-card>
    </div>
    <div v-else class="empty-state">
      <p>暂无套餐信息</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getPlans } from '@/utils/api'
import { getPublicSettings } from '@/utils/api/settings'
import { showToast } from '@/utils'
import { Check } from '@lucide/vue'

const plans = ref([])
const serviceWechat = ref('')

// 判断是否为推荐套餐（优先使用is_recommended字段，否则根据价格判断）
function isRecommended(plan) {
  // 如果套餐有is_recommended字段，直接使用
  if (plan.is_recommended !== undefined) {
    return plan.is_recommended
  }
  // 否则根据价格判断：价格在100-300之间的为推荐套餐
  return plan.price >= 100 && plan.price <= 300
}

function priceColor(index) {
  const colors = ['var(--studio-accent)', 'var(--studio-warning)', 'var(--studio-success)', '#8B5CF6']
  return colors[index] || 'var(--studio-accent)'
}

function getFeatures(featuresStr) {
  if (!featuresStr) return ['基础功能']
  try {
    return featuresStr.split('\n').filter(f => f.trim())
  } catch {
    return [featuresStr]
  }
}

function contactService() {
  const wechat = serviceWechat.value || '暂未配置'
  showToast(`客服微信：${wechat}`, 'info')
}

async function loadData() {
  try {
    const [plansData, settingsData] = await Promise.all([
      getPlans(),
      getPublicSettings()
    ])
    plans.value = plansData
    // 从公开设置中获取客服微信
    if (settingsData && Array.isArray(settingsData)) {
      const wechatSetting = settingsData.find(s => s.key === 'service_wechat' || s.key === 'wechat_id')
      if (wechatSetting) {
        serviceWechat.value = wechatSetting.value
      }
    }
  } catch (err) {
    showToast('套餐加载失败', 'error')
  }
}

onMounted(loadData)
</script>

<style scoped>
.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
}

.plan-card {
  text-align: center;
  position: relative;
  padding: var(--spacing-lg);
}

.plan-card.featured {
  border: 2px solid var(--studio-accent) !important;
}

.recommend-tag {
  position: absolute;
  top: 12px;
  right: 12px;
}

.svip-badge {
  display: inline-block;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  color: white;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
}

.plan-name {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--studio-text-main);
  margin-bottom: var(--spacing-sm);
}

.plan-price {
  font-family: var(--font-heading);
  font-size: 2.2rem;
  font-weight: 700;
  margin-bottom: var(--spacing-xs);
}

.plan-duration {
  font-size: 0.85rem;
  color: var(--studio-text-muted);
  margin-bottom: var(--spacing-sm);
}

.code-prefix-info {
  margin: var(--spacing-sm) 0;
  padding: 0.5rem;
  background: rgba(14, 165, 233, 0.06);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  color: var(--studio-text-muted);
}

.code-prefix-info strong {
  color: var(--studio-accent);
  font-family: monospace;
  letter-spacing: 1px;
}

.plan-features {
  list-style: none;
  padding: 0;
  margin: var(--spacing-md) 0;
  text-align: left;
}

.plan-features li {
  padding: 0.4rem 0;
  font-size: 0.85rem;
  color: var(--studio-text-muted);
  border-bottom: 1px solid var(--color-border-light);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.plan-features li svg {
  color: var(--studio-success);
  flex-shrink: 0;
}

.plan-features li:last-child {
  border-bottom: none;
}
</style>