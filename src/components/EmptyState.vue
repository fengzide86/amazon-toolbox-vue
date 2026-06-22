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
  padding: 3rem 1rem;
  text-align: center;
}

.empty-state-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--studio-bg-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--studio-text-muted);
  margin-bottom: 1rem;
}

.empty-state-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--studio-text-main);
  margin: 0 0 0.5rem;
}

.empty-state-description {
  font-size: 0.875rem;
  color: var(--studio-text-muted);
  margin: 0;
  max-width: 300px;
}
</style>