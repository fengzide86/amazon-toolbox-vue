<template>
  <main class="marketing-document marketing-empty" data-route-focus>
    <BrandLockup audience="login" />
    <h1>这个页面暂时找不到了</h1>
    <p>你可以返回官网，继续了解课赛通或下载 Windows 桌面端。</p>
    <RouterLink to="/">返回课赛通官网</RouterLink>
  </main>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import BrandLockup from '@/components/brand/BrandLockup.vue'
</script>
