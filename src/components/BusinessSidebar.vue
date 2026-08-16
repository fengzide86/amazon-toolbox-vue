<template>
  <aside class="business-sidebar" aria-label="专业批量工作台导航">
    <div class="business-brand">
      <BrandLockup audience="business" layout="horizontal" />
    </div>
    <nav>
      <router-link to="/business/overview" active-class="is-active"><LayoutDashboard :size="16" />概览</router-link>
      <router-link to="/business/workspace" active-class="is-active"><PanelsTopLeft :size="16" />批量工作台</router-link>
      <router-link to="/business/records" active-class="is-active"><ClipboardList :size="16" />执行记录</router-link>
      <router-link to="/business/license" active-class="is-active"><BadgeCheck :size="16" />授权信息</router-link>
    </nav>
    <div class="sidebar-license">
      <span>当前授权</span>
      <strong>{{ planName }}</strong>
      <small>{{ seatLimit }} 个团队席位</small>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { BadgeCheck, ClipboardList, LayoutDashboard, PanelsTopLeft } from '@lucide/vue'
import BrandLockup from '@/components/brand/BrandLockup.vue'

const user = computed(() => {
  try { return JSON.parse(localStorage.getItem('toolbox_user') || '{}') } catch { return {} }
})
const planName = computed(() => user.value.plan_name || '专业授权')
const seatLimit = computed(() => user.value.seat_limit || 1)
</script>

<style scoped>
.business-sidebar{position:fixed;inset:0 auto 0 0;z-index:var(--z-sidebar);width:var(--sidebar-width);display:flex;flex-direction:column;border-right:1px solid var(--color-border);background:rgba(252,252,253,.98);backdrop-filter:blur(18px)}
.business-brand{height:var(--shell-header-height,88px);display:flex;align-items:center;padding:0 20px;border-bottom:1px solid var(--color-border)}
nav{display:grid;align-content:start;gap:5px;padding:22px 12px;flex:1}nav a{position:relative;min-height:42px;display:flex;align-items:center;gap:11px;padding:0 13px;border-radius:10px;color:var(--color-text-secondary);font-size:var(--type-control);font-weight:600;text-decoration:none;transition:background var(--motion-fast),color var(--motion-fast)}nav a:hover{color:var(--color-text);background:#f2f4f7}nav a.is-active{color:var(--color-primary);background:var(--color-primary-soft);box-shadow:inset 0 0 0 1px rgba(45,95,202,.045)}nav a.is-active:before{content:'';position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:3px;background:var(--color-primary)}
.sidebar-license{margin:12px;padding:15px;border:1px solid rgba(169,133,82,.25);border-radius:13px;background:var(--color-surface-premium,#f8f7f4);display:grid;gap:4px}.sidebar-license span,.sidebar-license small{font-size:var(--type-micro);color:var(--color-text-tertiary)}.sidebar-license strong{font-size:var(--type-meta);color:var(--color-text)}
@media(max-width:1024px){.business-sidebar{width:min(280px,86vw);transform:translateX(-100%);transition:transform var(--motion-slow) var(--ease-emphasized);box-shadow:var(--shadow-overlay)}.business-sidebar.mobile-open{transform:translateX(0)}}
</style>
