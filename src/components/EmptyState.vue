<template>
  <div class="empty-state-container">
    <div class="empty-state-icon">
      <component :is="icon" :size="48" />
    </div>
    <h3 class="empty-state-title">{{ title }}</h3>
    <p v-if="description" class="empty-state-description">{{ description }}</p>
    <slot></slot>
  </div>
</template>

<script setup>
defineProps({
  icon: {
    type: [Object, Function],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  }
})
</script>

<style scoped>
.empty-state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  padding: 3rem 1rem;
  text-align: center;
}

.empty-state-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--color-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  margin-bottom: 1rem;
}

.empty-state-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 0.5rem;
}

.empty-state-description {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0;
  max-width: 300px;
}
</style>
