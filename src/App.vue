<template>
  <div id="app">
    <ErrorBoundary>
      <router-view v-slot="{ Component }">
        <AppTransition mode="out-in">
          <component :is="Component" />
        </AppTransition>
      </router-view>
    </ErrorBoundary>
    <AppUpdateHost />
  </div>
</template>

<script setup lang="ts">
import AppUpdateHost from '@/features/updates/AppUpdateHost.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import AppTransition from '@/components/AppTransition.vue'
</script>

<style>
#app {
  min-height: 100vh;
}
</style>
