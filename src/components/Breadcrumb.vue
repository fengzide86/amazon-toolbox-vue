<template>
  <nav class="breadcrumb" aria-label="面包屑导航">
    <router-link to="/" class="breadcrumb-item">
      <Home :size="14" />
      首页
    </router-link>
    <span class="breadcrumb-separator">/</span>
    <span class="breadcrumb-item active">{{ currentTitle }}</span>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Home } from '@lucide/vue'

const route = useRoute()

const currentTitle = computed(() => {
  return route.meta?.title || '未知页面'
})
</script>

<style scoped>
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
  color: var(--color-muted);
}

.breadcrumb-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--color-muted);
  text-decoration: none;
  transition: color 0.2s;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
}

.breadcrumb-item:hover {
  color: var(--color-accent);
  background: rgba(99, 102, 241, 0.06);
}

.breadcrumb-item.active {
  color: var(--color-primary);
  font-weight: 500;
}

.breadcrumb-item svg {
  opacity: 0.7;
}

.breadcrumb-separator {
  color: var(--color-border);
  font-size: 0.8rem;
}
</style>
