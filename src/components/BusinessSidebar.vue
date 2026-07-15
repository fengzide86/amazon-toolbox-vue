<template>
  <aside class="business-sidebar" aria-label="专业批量版导航">
    <div class="business-brand">
      <div class="brand-mark"><Layers3 :size="16" /></div>
      <div><strong>专业批量版</strong><span>Business Workspace</span></div>
    </div>
    <nav>
      <router-link to="/business/overview" active-class="is-active"><LayoutDashboard :size="16" />工作概览</router-link>
      <router-link to="/business/workspace" active-class="is-active"><PanelsTopLeft :size="16" />批量工作台</router-link>
      <router-link to="/business/records" active-class="is-active"><ClipboardList :size="16" />执行记录</router-link>
      <router-link to="/business/license" active-class="is-active"><BadgeCheck :size="16" />授权与席位</router-link>
    </nav>
    <div class="sidebar-license">
      <span>当前授权</span>
      <strong>{{ planName }}</strong>
      <small>{{ seatLimit }} 个团队席位</small>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { BadgeCheck, ClipboardList, Layers3, LayoutDashboard, PanelsTopLeft } from '@lucide/vue'

const user = computed(() => {
  try { return JSON.parse(localStorage.getItem('toolbox_user') || '{}') } catch { return {} }
})
const planName = computed(() => user.value.plan_name || '专业授权')
const seatLimit = computed(() => user.value.seat_limit || 1)
</script>

<style scoped>
.business-sidebar{position:fixed;inset:0 auto 0 0;z-index:var(--z-sidebar);width:var(--sidebar-width);display:flex;flex-direction:column;border-right:1px solid var(--color-border);background:rgba(252,252,253,.98);backdrop-filter:blur(18px)}
.business-brand{height:var(--header-height);display:flex;align-items:center;gap:11px;padding:0 18px;border-bottom:1px solid var(--color-border)}
.brand-mark{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;color:#fff;background:linear-gradient(145deg,var(--color-primary),#4776d7);box-shadow:0 7px 17px rgba(45,95,202,.2)}
.business-brand div:last-child{display:grid;gap:1px;min-width:0}.business-brand strong{font-size:13px;color:var(--color-text)}.business-brand span{font-size:9px;letter-spacing:.08em;color:var(--color-accent)}
nav{display:grid;gap:5px;padding:20px 12px;flex:1}nav a{position:relative;min-height:42px;display:flex;align-items:center;gap:11px;padding:0 13px;border-radius:10px;color:var(--color-text-secondary);font-size:13px;font-weight:600;text-decoration:none;transition:background var(--motion-fast),color var(--motion-fast)}nav a:hover{color:var(--color-text);background:#f2f4f7}nav a.is-active{color:var(--color-primary);background:var(--color-primary-soft)}nav a.is-active:before{content:'';position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:3px;background:var(--color-primary)}
.sidebar-license{margin:12px;padding:15px;border:1px solid rgba(169,133,82,.25);border-radius:13px;background:var(--color-surface-premium,#f8f7f4);display:grid;gap:4px}.sidebar-license span,.sidebar-license small{font-size:10px;color:var(--color-text-tertiary)}.sidebar-license strong{font-size:12px;color:var(--color-text)}
@media(max-width:1024px){.business-sidebar{width:min(280px,86vw);transform:translateX(-100%);transition:transform var(--motion-slow) var(--ease-emphasized);box-shadow:var(--shadow-overlay)}.business-sidebar.mobile-open{transform:translateX(0)}}
</style>
