<template><Transition name="app-fade" :mode="mode"><slot /></Transition></template>

<script setup>
defineProps({ mode: { type: String, default: 'out-in' } })
</script>
