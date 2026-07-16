<template>
  <div class="license-page">
    <header><span>BUSINESS LICENSE</span><h1>授权与席位</h1><p>当前授权决定批量工具、单批次数量和可保留的浏览器现场。</p></header>
    <section class="license-card">
      <div class="license-mark"><BadgeCheck :size="26" /></div>
      <div><small>当前专业授权</small><h2>{{ user.plan_name || '专业批量版' }}</h2><p>有效期至 {{ formatDate(user.expires_at) }}</p></div>
      <span class="business-badge">BUSINESS</span>
    </section>
    <section class="limits-grid">
      <article><span>团队席位</span><strong>{{ user.seat_used || 0 }} / {{ user.seat_limit || 1 }}</strong><small>按当前授权码绑定</small></article>
      <article><span>单批次上限</span><strong>{{ store.entitlements.max_batch_rows || 50 }}</strong><small>仅统计有效导入行</small></article>
      <article><span>浏览器现场</span><strong>{{ store.entitlements.max_open_sessions || 6 }}</strong><small>等待操作时保留</small></article>
    </section>
    <p class="security-note"><ShieldCheck :size="16" />客户密码、Cookie 和 Excel 原文不会上传到服务端。</p>
  </div>
</template>
<script setup>
import { computed } from 'vue'; import { BadgeCheck, ShieldCheck } from '@lucide/vue'; import { useBusinessWorkspaceStore } from '@/stores/businessWorkspace'
const store=useBusinessWorkspaceStore(); const user=computed(()=>{try{return JSON.parse(localStorage.getItem('toolbox_user')||'{}')}catch{return{}}}); const formatDate=v=>v?new Date(v).toLocaleDateString('zh-CN'):'未设置'
</script>
<style scoped>
.license-page{display:grid;gap:20px}.license-page>header span{font-size:var(--type-micro);font-weight:800;letter-spacing:.12em;color:var(--color-accent)}h1{margin:7px 0 0;font-size:28px;letter-spacing:-.04em;color:var(--color-text)}header p{margin:8px 0 0;color:var(--color-text-secondary)}.license-card{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:16px;padding:24px;border:1px solid rgba(169,133,82,.26);border-radius:17px;background:linear-gradient(145deg,#fcfcfd,#f8f7f4);box-shadow:var(--shadow-low)}.license-mark{width:52px;height:52px;display:grid;place-items:center;border-radius:15px;color:var(--color-accent);background:#f1eadf}.license-card small{color:var(--color-text-tertiary)}.license-card h2{margin:5px 0;color:var(--color-text)}.license-card p{margin:0;color:var(--color-text-secondary);font-size:12px}.business-badge{padding:6px 9px;border-radius:7px;color:var(--color-accent);background:#f1eadf;font-size:var(--type-micro);font-weight:800;letter-spacing:.1em}.limits-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.limits-grid article{padding:20px;display:grid;gap:8px;border:1px solid var(--color-border);border-radius:15px;background:var(--color-surface)}.limits-grid span,.limits-grid small{font-size:var(--type-meta);color:var(--color-text-tertiary)}.limits-grid strong{font-size:24px;color:var(--color-text);font-variant-numeric:tabular-nums}.security-note{display:flex;align-items:center;gap:8px;padding:14px;color:var(--color-success);font-size:12px;background:#edf8f4;border-radius:12px}@media(max-width:760px){.limits-grid{grid-template-columns:1fr}.business-badge{display:none}}
</style>
