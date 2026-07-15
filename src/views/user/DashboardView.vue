<template>
  <div class="dashboard-compat" aria-live="polite">
    <div class="dashboard-compat__mark"><Zap :size="22" /></div>
    <h2>工具箱已作为默认首页</h2>
    <p>选择需要完成的业务，系统会自动打开并处理。</p>
    <router-link to="/user/tools">进入工具箱 <ArrowRight :size="16" /></router-link>
  </div>
</template>

<script setup>
import { ArrowRight, Zap } from '@lucide/vue'
</script>

<style scoped>
.dashboard-compat {
  min-height: 420px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: var(--color-text-secondary);
  text-align: center;
}
.dashboard-compat__mark { width: 52px; height: 52px; display: grid; place-items: center; margin-bottom: 4px; border-radius: 15px; color: var(--color-primary); background: var(--color-primary-soft); }
.dashboard-compat h2 { margin: 0; color: var(--color-text); font-size: 20px; }
.dashboard-compat p { margin: 0; font-size: 13px; }
.dashboard-compat a { min-height: 40px; display: inline-flex; align-items: center; gap: 7px; margin-top: 8px; padding: 0 15px; border-radius: var(--radius-md); color: #fff; background: var(--color-primary); font-size: 13px; font-weight: 700; text-decoration: none; }
</style>
