<template>
  <el-drawer
    v-model="visible"
    title="我的工单"
    size="min(560px, 94vw)"
    @open="load(1)"
  >
    <p>查看已提交的问题和工作人员回复。</p>
    <p
      v-if="loading"
      role="status"
    >
      正在加载工单…
    </p>
    <div
      v-else-if="error"
      role="alert"
    >
      {{ error }} <el-button @click="load(page)">
        重试
      </el-button>
    </div>
    <p v-else-if="!tickets.length">
      暂无工单
    </p>
    <article
      v-for="ticket in tickets"
      :key="ticket.id"
      class="support-ticket"
    >
      <header><strong>{{ ticket.title }}</strong><span>{{ statusLabel(ticket.status) }}</span></header>
      <small>{{ formatChatTime(ticket.created_at) }}</small>
      <details><summary>查看问题内容</summary><p>{{ ticket.content }}</p></details>
      <div class="staff-reply">
        <strong>工作人员回复</strong><p>{{ ticket.admin_reply || '尚未回复，请稍后刷新查看。' }}</p>
      </div>
    </article>
    <template #footer>
      <div class="ticket-paging">
        <el-button
          :disabled="loading || page <= 1"
          @click="load(page - 1)"
        >
          上一页
        </el-button><span>第 {{ page }} 页</span><el-button
          :disabled="loading || !hasNext"
          @click="load(page + 1)"
        >
          下一页
        </el-button><el-button
          :disabled="loading"
          @click="load(page)"
        >
          刷新
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>
<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { ElButton, ElDrawer } from 'element-plus'
import { z } from 'zod'
import { getMyFeedbacks } from '@/utils/api'
import { formatChatTime } from '@/features/ai/presentation'
const visible = defineModel<boolean>({ default: false })
const ticketSchema = z.object({ id: z.union([z.number(), z.string()]), title: z.string(), content: z.string(), status: z.string(), admin_reply: z.string().nullable().optional(), created_at: z.string().nullable().optional() })
const tickets = ref<z.infer<typeof ticketSchema>[]>([])
const page = ref(1), loading = ref(false), hasNext = ref(false), error = ref('')
let requestId = 0
onBeforeUnmount(() => { requestId++ })
const statusLabel = (status: string) => ({ pending: '待处理', processing: '处理中', resolved: '已解决' })[status] || status
async function load(target: number) {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = z.array(ticketSchema).parse(await getMyFeedbacks({ page: target, page_size: 10 }))
    if (id !== requestId) return
    tickets.value = result
    page.value = target
    hasNext.value = result.length === 10
  } catch { if (id === requestId) error.value = '工单加载失败，请重试' }
  finally { if (id === requestId) loading.value = false }
}
</script>
<style scoped>
p, small { color: var(--color-text-secondary); font-size: 13px; line-height: 1.7; }
.support-ticket { border: 1px solid var(--color-border); border-radius: 12px; padding: 18px; margin: 16px 0; }
header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 14px; }
header span { color: var(--color-primary); white-space: nowrap; font-size: 12px; }
details { margin: 14px 0; font-size: 13px; } summary { cursor: pointer; }
.support-ticket p { white-space: pre-wrap; overflow-wrap: anywhere; }
.staff-reply { padding: 14px; border-radius: 8px; background: var(--color-surface-soft); font-size: 13px; }
.staff-reply p { margin-bottom: 0; } .ticket-paging { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
</style>
