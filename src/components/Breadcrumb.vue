<template>
  <nav class="breadcrumb" aria-label="面包屑导航">
    <router-link :to="homePath" class="breadcrumb-item" aria-label="返回首页">
      <Home :size="13" />
      首页
    </router-link>
    <span class="breadcrumb-separator">/</span>
    <span class="breadcrumb-item active" aria-current="page">{{ currentTitle }}</span>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Home } from '@lucide/vue'

const route = useRoute()

const homePath = computed(() => {
  return route.path?.startsWith('/admin') ? '/admin/dashboard' : '/user/tools'
})

const currentTitle = computed(() => {
  return route.meta?.title || '未知页面'
})
</script>

<style scoped>
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 30px;
  padding: 0;
  margin-bottom: 14px;
  font-size: 11px;
  color: var(--color-muted);
}

.breadcrumb-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--color-muted);
  text-decoration: none;
  transition: color 0.2s;
  padding: 4px 6px;
  border-radius: 7px;
}

.breadcrumb-item:hover {
  color: var(--color-accent);
  background: var(--color-primary-soft);
}

.breadcrumb-item.active {
  color: var(--color-primary);
  font-weight: 700;
}

.breadcrumb-item svg {
  opacity: 0.7;
}

.breadcrumb-separator {
  color: var(--color-text-tertiary);
  font-size: 0.8rem;
}
</style>
