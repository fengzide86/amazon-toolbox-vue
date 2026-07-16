<template>
  <AnnouncementBanner :hide-banner="showUpdateNotice || hideAnnouncementBanner" />
  <UpdateNoticeBar v-if="showUpdateNotice" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AnnouncementBanner from '@/components/AnnouncementBanner.vue'
import UpdateNoticeBar from '@/features/updates/UpdateNoticeBar.vue'
import { useAnnouncementStore } from '@/features/announcements/store'
import { useUpdateStore } from '@/features/updates/store'

const props = defineProps<{ suppressUpdate?: boolean; hideAnnouncementBanner?: boolean }>()
const announcements = useAnnouncementStore()
const updates = useUpdateStore()
const showUpdateNotice = computed(() => updates.shouldShowNotice && !props.suppressUpdate && !announcements.critical)
</script>
