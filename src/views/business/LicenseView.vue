<template>
  <div class="license-page">
    <header><span>BUSINESS LICENSE</span><h1>授权信息</h1><p>这里展示当前专业套餐、本机授权状态和演示模式边界。</p></header>
    <section class="license-card">
      <div class="license-mark"><BadgeCheck :size="26" /></div>
      <div><small>当前专业授权</small><h2>{{ user.plan_name || '专业批量版' }}</h2><p>有效期至 {{ formatDate(user.expires_at) }}</p></div>
      <span class="business-badge">BUSINESS</span>
    </section>
    <section class="limits-grid">
      <article><span>这台电脑</span><strong>{{ deviceAuthorized ? '已授权' : '等待授权' }}</strong><small>{{ user.device_used || 0 }} / {{ user.max_devices || 1 }} 台设备</small></article>
      <article><span>单批次上限</span><strong>{{ store.entitlements.max_batch_rows || 50 }}</strong><small>仅统计有效导入行</small></article>
      <article><span>并行演示槽位</span><strong>{{ store.entitlements.max_open_sessions || 6 }}</strong><small>仅暂存本地模拟状态</small></article>
    </section>
    <p class="security-note"><ShieldCheck :size="16" />客户密码、Cookie 和 Excel 原文不会上传到服务端。</p>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { BadgeCheck, ShieldCheck } from '@lucide/vue'
import { z } from 'zod'
import { useBusinessDemoWorkspaceStore } from '@/stores/businessDemoWorkspace'

const storedBusinessUserSchema = z.object({
  plan_name: z.string().optional(),
  expires_at: z.string().nullable().optional(),
  seat_used: z.number().optional(),
  seat_limit: z.number().optional(),
  device_used: z.number().optional(),
  max_devices: z.number().optional(),
}).passthrough()

const store = useBusinessDemoWorkspaceStore()
const user = computed(() => {
  try {
    return storedBusinessUserSchema.parse(JSON.parse(localStorage.getItem('toolbox_user') || '{}'))
  } catch {
    return storedBusinessUserSchema.parse({})
  }
})
const deviceAuthorized = computed(() => (user.value.device_used || 0) > 0)
const formatDate = (value: string | null | undefined): string => value
  ? new Date(value).toLocaleDateString('zh-CN')
  : '未设置'
</script>
<style scoped>
.license-page{display:grid;gap:20px}.license-page>header span{font-size:var(--type-micro);font-weight:800;letter-spacing:.12em;color:var(--color-primary)}h1{margin:7px 0 0;font-size:var(--type-page);letter-spacing:-.04em;color:var(--color-text)}header p{margin:8px 0 0;color:var(--color-text-secondary);font-size:var(--type-control);line-height:1.6}.license-card{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:16px;padding:24px;border:1px solid rgba(169,133,82,.26);border-radius:17px;background:linear-gradient(145deg,#fcfcfd,#f8f7f4);box-shadow:var(--shadow-low)}.license-mark{width:52px;height:52px;display:grid;place-items:center;border-radius:15px;color:#765d38;background:#f1eadf}.license-card small{color:var(--color-text-tertiary);font-size:var(--type-meta)}.license-card h2{margin:5px 0;color:var(--color-text);font-size:22px}.license-card p{margin:0;color:var(--color-text-secondary);font-size:var(--type-control)}.business-badge{padding:6px 9px;border-radius:7px;color:#765d38;background:#f1eadf;font-size:var(--type-micro);font-weight:800;letter-spacing:.1em}.limits-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.limits-grid article{min-height:130px;padding:20px;display:grid;align-content:space-between;gap:8px;border:1px solid var(--color-border);border-radius:15px;background:var(--color-surface)}.limits-grid span,.limits-grid small{font-size:var(--type-meta);color:var(--color-text-tertiary)}.limits-grid strong{font-size:22px;color:var(--color-text);font-variant-numeric:tabular-nums}.security-note{display:flex;align-items:center;gap:8px;padding:14px;color:var(--color-success);font-size:var(--type-meta);background:#edf8f4;border-radius:12px}@media(max-width:760px){.limits-grid{grid-template-columns:1fr}.business-badge{display:none}.license-card{grid-template-columns:auto 1fr}}
</style>
