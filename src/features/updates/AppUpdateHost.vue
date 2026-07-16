<template>
  <UpdateDetailsDrawer />
  <UpdateRestartDialog />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useUpdateStore } from './store'
import UpdateDetailsDrawer from './UpdateDetailsDrawer.vue'
import UpdateRestartDialog from './UpdateRestartDialog.vue'

const store = useUpdateStore()
onMounted(() => store.initialize())
onUnmounted(() => store.dispose())
</script>
