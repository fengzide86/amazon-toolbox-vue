<template>
  <div id="app">
    <ErrorBoundary>
      <router-view v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </router-view>
    </ErrorBoundary>
    <UpdateProgress />
  </div>
</template>

<script setup>
import UpdateProgress from '@/components/UpdateProgress.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
</script>

<style>
#app {
  min-height: 100vh;
}
</style>
