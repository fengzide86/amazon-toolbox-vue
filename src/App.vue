<template>
  <div id="app">
    <ErrorBoundary>
      <router-view />
    </ErrorBoundary>
    <UpdateProgress />
  </div>
</template>

<script setup>
import UpdateProgress from '@/components/UpdateProgress.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
</script>
