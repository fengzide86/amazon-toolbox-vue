<template>
  <div class="agency-management">
    <PageHeader
      title="代理与交付"
      description="管理代理归属，核对收款，发放授权，统一跟进售后。"
    >
      <template #actions>
        <el-button @click="router.push('/admin/staff-accounts')">
          关联代理账号
        </el-button>
      </template>
    </PageHeader>
    <el-alert
      title="负责人视角：可查看全部代理业务；代理账号仅能访问本代理的数据。内部运营、客服账号保持原有权限。"
      type="info"
      :closable="false"
      show-icon
      class="owner-notice"
    />
    <nav
      class="owner-tabs"
      aria-label="代理管理分区"
    >
      <button
        v-for="(label, key) in sectionLabels"
        :key="key"
        type="button"
        :class="{ active: section === key }"
        :aria-pressed="section === key"
        @click="section = key"
      >
        {{ label }}
      </button>
    </nav>
    <AgencyRecordsView
      :key="section"
      :section="section"
      owner
    />
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import AgencyRecordsView from './AgencyRecordsView.vue'
import { sectionLabels, type Section } from './model'
const router = useRouter()
const section = ref<Section>('agencies')
</script>
<style scoped>
.agency-management{width:100%;min-width:0;max-width:1400px;margin:auto}.owner-notice{margin-bottom:22px}.owner-tabs{display:flex;gap:8px;margin:0 0 26px;border-bottom:1px solid var(--color-border);overflow-x:auto}.owner-tabs button{white-space:nowrap;padding:13px 16px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--color-text-secondary);font-size:14px;cursor:pointer}.owner-tabs button.active{color:var(--color-primary);border-bottom-color:var(--color-primary);font-weight:700}.owner-tabs button:hover{background:var(--color-primary-soft)}
</style>
