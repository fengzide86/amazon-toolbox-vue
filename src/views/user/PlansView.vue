<template>
  <div>
    <h2 style="font-family: var(--font-heading); font-size: 1.5rem; color: var(--color-primary); margin-bottom: 1.5rem;">
      套餐价格
    </h2>
    <div v-if="plans.length" class="plans-grid">
      <div v-for="(plan, index) in plans" :key="plan.id" class="plan-card" :class="{ featured: index === 2 }">
        <!-- SVIP 标识 -->
        <div v-if="plan.code_prefix" class="svip-badge">
          {{ plan.code_prefix }}
        </div>
        <div class="plan-name">{{ plan.name }}</div>
        <div class="plan-price" :style="{ color: index === 0 ? 'var(--color-accent)' : index === 1 ? 'var(--color-gold)' : index === 2 ? 'var(--color-success)' : '#9333EA' }">
          ¥{{ plan.price }}
        </div>
        <div class="plan-duration">{{ plan.duration_days }} 天有效期</div>
        <!-- 授权码前缀展示 -->
        <div v-if="plan.code_prefix" class="code-prefix-info">
          授权码前缀: <strong>{{ plan.code_prefix }}</strong>
        </div>
        <ul class="plan-features">
          <li v-for="(feature, i) in getFeatures(plan.features)" :key="i">{{ feature }}</li>
        </ul>
        <button class="btn" :class="index === 2 ? 'btn-primary' : 'btn-secondary'" style="width: 100%;" @click="contactService">
          联系客服购买
        </button>
      </div>
    </div>
    <div v-else style="padding: 2rem; text-align: center; color: var(--color-muted);">
      暂无套餐信息
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getPlans } from '@/utils/api'
import { showToast } from '@/utils'

const plans = ref([])

function getFeatures(featuresStr) {
  if (!featuresStr) return ['基础功能']
  try {
    return featuresStr.split('\n').filter(f => f.trim())
  } catch {
    return [featuresStr]
  }
}

function contactService() {
  showToast('客服微信：AmazonToolbox_Support', 'info')
}

async function loadData() {
  try {
    plans.value = await getPlans()
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
  background: white;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  text-align: center;
  position: relative;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition);
}

.plan-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.plan-card.featured {
  border: 2px solid var(--color-accent);
  box-shadow: var(--shadow-md);
}

.svip-badge {
  position: absolute;
  top: -10px;
  right: -10px;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(255, 215, 0, 0.4);
}

.plan-name {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: var(--spacing-sm);
}

.plan-price {
  font-family: var(--font-heading);
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: var(--spacing-xs);
}

.plan-duration {
  font-size: 0.85rem;
  color: var(--color-muted);
  margin-bottom: var(--spacing-sm);
}

.code-prefix-info {
  margin-top: var(--spacing-sm);
  padding: 0.5rem;
  background: rgba(99, 102, 241, 0.08);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  color: var(--color-muted);
}

.code-prefix-info strong {
  color: var(--color-accent);
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
  padding: 0.5rem 0;
  font-size: 0.85rem;
  color: var(--color-muted);
  border-bottom: 1px solid var(--color-border-light);
}

.plan-features li:last-child {
  border-bottom: none;
}
</style>
