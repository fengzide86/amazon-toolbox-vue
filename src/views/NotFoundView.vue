<template>
  <main class="not-found" data-route-focus>
    <BrandLockup class="not-found-brand" audience="login" layout="horizontal" />
    <span aria-hidden="true">404</span>
    <h1>这个页面不存在</h1>
    <p>链接可能已失效，或者当前版本还没有这个页面。</p>
    <router-link :to="homePath">返回可用页面</router-link>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { authService } from '@/utils/auth'
import { hasBusinessWorkspaceAccess } from '@/features/auth/model'
import BrandLockup from '@/components/brand/BrandLockup.vue'

const homePath = computed(() => {
  if (authService.isBackoffice()) return '/admin/dashboard'
  if (hasBusinessWorkspaceAccess(authService.getUser())) return '/business/overview'
  return authService.isAuthenticated() ? '/user/tools' : '/user/login'
})
</script>

<style scoped>
.not-found{min-height:100vh;display:grid;place-content:center;justify-items:center;gap:12px;padding:24px;text-align:center;background:var(--color-canvas)}.not-found-brand{margin-bottom:22px}
.not-found>span{font-size:clamp(64px,12vw,120px);font-weight:900;line-height:1;color:var(--color-primary-soft);text-shadow:0 0 0 var(--color-primary)}
h1{margin:0;color:var(--color-text);font-size:var(--type-page)}p{margin:0;color:var(--color-text-secondary)}a{margin-top:8px;padding:10px 16px;border-radius:10px;color:#fff;background:var(--color-primary);font-weight:700;text-decoration:none}
</style>
