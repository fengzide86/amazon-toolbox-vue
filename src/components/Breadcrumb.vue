<template>
  <nav class="breadcrumb" aria-label="面包屑导航">
    <router-link to="/" class="breadcrumb-item">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
      </svg>
      首页
    </router-link>
    <span class="breadcrumb-separator">/</span>
    <span class="breadcrumb-item active">{{ currentTitle }}</span>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

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
