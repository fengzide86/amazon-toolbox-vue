<template>
  <div>
    <h2 style="font-family: var(--font-heading); font-size: 1.5rem; color: var(--color-primary); margin-bottom: 1.5rem;">
      常见问题
    </h2>
    <div class="table-card">
      <div v-for="(item, index) in faqs" :key="index" style="padding: 1.5rem 0; border-bottom: 1px solid var(--color-border);">
        <h3 style="font-size: 1rem; font-weight: 600; color: var(--color-primary); margin-bottom: 0.5rem;">
          {{ item.q }}
        </h3>
        <p style="color: var(--color-muted); font-size: 0.9rem; line-height: 1.6;">
          {{ item.a }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const faqs = ref([
  {
    q: 'Q1: 如何获取授权码？',
    a: '购买套餐后，系统会自动发送授权码到您的邮箱。请查收邮件并按照说明使用。'
  },
  {
    q: 'Q2: 授权码可以更换设备吗？',
    a: '每个授权码只能绑定一台设备。如需更换设备，请联系客服处理。'
  },
  {
    q: 'Q3: 工具运行失败怎么办？',
    a: '请先检查网络连接，然后重试。如果问题持续，请通过日志页面联系客服。'
  },
  {
    q: 'Q4: 如何升级套餐？',
    a: '在"套餐价格"页面选择适合的套餐，购买后会获得新的授权码。'
  },
  {
    q: 'Q5: 数据多久更新一次？',
    a: '我们的数据每天都会更新，确保您获取最新的信息。'
  },
  {
    q: 'Q6: 支持退款吗？',
    a: '购买后 24 小时内，如未使用工具，可申请全额退款。请联系客服处理。'
  }
])
</script>