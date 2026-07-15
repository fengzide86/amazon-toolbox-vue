<template>
  <div id="app">
    <ErrorBoundary>
      <router-view v-slot="{ Component }">
        <AppTransition mode="out-in">
          <component :is="Component" />
        </AppTransition>
      </router-view>
    </ErrorBoundary>
    <UpdateProgress />
  </div>
</template>

<script setup>
import UpdateProgress from '@/components/UpdateProgress.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import AppTransition from '@/components/AppTransition.vue'
</script>

<style>
#app {
  min-height: 100vh;
}
</style>
