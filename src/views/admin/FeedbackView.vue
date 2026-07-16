<template>
  <div>
    <PageHeader title="工单管理" description="查看客户反馈并跟进处理状态" />

    <DataToolbar label="工单筛选">
      <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 160px;">
        <el-option label="全部状态" value="" />
        <el-option label="待处理" value="pending" />
        <el-option label="处理中" value="processing" />
        <el-option label="已解决" value="resolved" />
      </el-select>
      <template #summary>共 {{ filteredFeedbacks.length }} 个工单</template>
    </DataToolbar>

    <el-card class="table-card" shadow="never">
      <el-table :data="filteredFeedbacks" stripe style="width: 100%">
        <el-table-column v-if="!isCompact" prop="id" label="ID" width="80" />
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column v-if="!isCompact" prop="user_id" label="用户ID" width="100" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="!isCompact" label="创建时间" width="160">
          <template #default="{ row }">
            <span class="time-text">{{ formatTime(row.created_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="viewDetail(row)">查看</el-button>
            <el-button 
              type="primary" 
              size="small" 
              @click="openReply(row)" 
              :disabled="row.status === 'resolved'"
            >
              {{ row.status === 'pending' ? '处理' : '回复' }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-state">暂无工单数据</div>
        </template>
      </el-table>
    </el-card>

    <!-- 查看详情 -->
    <AdminDetailDrawer v-model="showDetailModal" title="工单详情" size="min(600px, 92vw)">
      <div class="detail-content">
        <div class="detail-row">
          <span class="detail-label">标题：</span>
          <span>{{ currentFeedback?.title || '-' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">用户ID：</span>
          <span>{{ currentFeedback?.user_id || '-' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">状态：</span>
          <el-tag :type="getStatusType(currentFeedback?.status)" size="small">
            {{ getStatusText(currentFeedback?.status) }}
          </el-tag>
        </div>
        <div class="detail-row">
          <span class="detail-label">创建时间：</span>
          <span class="time-text">{{ formatTime(currentFeedback?.created_at) }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">内容：</span>
          <div class="detail-text">{{ currentFeedback?.content || '无内容' }}</div>
        </div>
        <div class="detail-row" v-if="currentFeedback && feedbackScreenshots(currentFeedback)">
          <span class="detail-label">截图：</span>
          <div class="screenshot-list">
            <el-image
              v-for="(url, index) in parseScreenshots(feedbackScreenshots(currentFeedback))"
              :key="index"
              :src="url"
              :preview-src-list="parseScreenshots(feedbackScreenshots(currentFeedback))"
              :initial-index="index"
              fit="cover"
              class="screenshot-img"
            />
          </div>
        </div>
        <div class="detail-row" v-if="currentFeedback?.admin_reply">
          <span class="detail-label">管理员回复：</span>
          <div class="detail-text reply-text">{{ currentFeedback.admin_reply }}</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showDetailModal = false">关闭</el-button>
      </template>
    </AdminDetailDrawer>

    <!-- 回复弹窗 -->
    <el-dialog 
      v-model="showReplyModal" 
      :title="currentFeedback?.status === 'pending' ? '处理工单' : '回复工单'" 
      width="500px"
    >
      <div class="reply-info">
        工单：{{ currentFeedback?.title }}
      </div>
      
      <el-form label-width="80px">
        <el-form-item label="状态">
          <el-select v-model="replyStatus" style="width: 100%;">
            <el-option label="处理中" value="processing" />
            <el-option label="已解决" value="resolved" />
          </el-select>
        </el-form-item>
        <el-form-item label="回复内容">
          <el-input
            v-model="replyContent"
            type="textarea"
            :rows="4"
            placeholder="请输入回复内容..."
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showReplyModal = false">取消</el-button>
        <el-button type="primary" @click="submitReply" :loading="isSubmitting">
          {{ isSubmitting ? '提交中...' : '提交' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { getFeedbacks, updateFeedback, API_BASE } from '@/utils/api'
import { showToast } from '@/utils'
import DataToolbar from '@/components/DataToolbar.vue'
import { usePlatformStore } from '@/stores/platform'
import { useCompactLayout } from '@/composables/useCompactLayout'
import PageHeader from '@/components/PageHeader.vue'
import AdminDetailDrawer from '@/components/AdminDetailDrawer.vue'
import {
  adminFeedbacksSchema,
  adminFeedbackSchema,
  type AdminFeedback,
  type FeedbackStatus,
} from '@/features/admin/model'

const platformStore = usePlatformStore()
const isCompact = useCompactLayout()
const feedbacks = ref<AdminFeedback[]>([])
const filterStatus = ref('')
const showDetailModal = ref(false)
const showReplyModal = ref(false)
const currentFeedback = ref<AdminFeedback | null>(null)
const replyStatus = ref<FeedbackStatus>('processing')
const replyContent = ref('')
const isSubmitting = ref(false)

const filteredFeedbacks = computed(() => {
  if (!filterStatus.value) return feedbacks.value
  return feedbacks.value.filter(f => f.status === filterStatus.value)
})

function getStatusType(status?: string | null): 'warning' | 'info' | 'success' {
  const map: Record<string, 'warning' | 'info' | 'success'> = { pending: 'warning', processing: 'info', resolved: 'success' }
  return status ? map[status] || 'warning' : 'warning'
}

function getStatusText(status?: string | null) {
  const map: Record<string, string> = { pending: '待处理', processing: '处理中', resolved: '已解决' }
  return status ? map[status] || status : '-'
}

function formatTime(timeStr?: string | null) {
  if (!timeStr) return '-'
  const d = new Date(timeStr)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function viewDetail(fb: unknown) {
  currentFeedback.value = adminFeedbackSchema.parse(fb)
  showDetailModal.value = true
}

function openReply(fb: unknown) {
  const feedback = adminFeedbackSchema.parse(fb)
  currentFeedback.value = feedback
  replyStatus.value = feedback.status === 'pending' ? 'processing' : feedback.status
  replyContent.value = feedback.admin_reply || ''
  showReplyModal.value = true
}

async function submitReply() {
  if (!currentFeedback.value) return
  if (!replyContent.value.trim() && replyStatus.value === 'resolved') {
    showToast('请输入回复内容', 'error')
    return
  }
  isSubmitting.value = true
  try {
    await updateFeedback(currentFeedback.value.id, {
      status: replyStatus.value,
      admin_reply: replyContent.value.trim()
    })
    showToast('回复成功', 'success')
    showReplyModal.value = false
    await loadData()
  } catch (err) {
    showToast('回复失败', 'error')
  } finally {
    isSubmitting.value = false
  }
}

function feedbackScreenshots(feedback: AdminFeedback): string | string[] | null | undefined {
  return feedback.screenshots ?? feedback.screenshot
}

function parseScreenshots(screenshotsStr: string | string[] | null | undefined): string[] {
  if (!screenshotsStr) return []
  try {
    const candidate: unknown = typeof screenshotsStr === 'string' ? JSON.parse(screenshotsStr) : screenshotsStr
    if (!Array.isArray(candidate)) return []
    return candidate
      .filter((url): url is string => typeof url === 'string')
      .map((url) => url.startsWith('http') ? url : `${API_BASE}${url}`)
  } catch {
    return []
  }
}

async function loadData() {
  try {
    const platformKey = platformStore.adminPlatform !== 'all' ? platformStore.adminPlatform : undefined
    feedbacks.value = adminFeedbacksSchema.parse(await getFeedbacks({ platform_key: platformKey }))
  } catch (err) {
    showToast('数据加载失败', 'error')
  }
}

watch(() => platformStore.adminPlatform, () => { loadData() })

onMounted(loadData)
</script>

<style scoped>
.data-toolbar-v6 { margin-bottom: 1rem; }

.table-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
}

.time-text {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-secondary);
}

.detail-content {
  max-height: 60vh;
  overflow-y: auto;
}

.detail-row {
  margin-bottom: 1rem;
}

.detail-label {
  font-weight: 600;
  color: var(--color-text);
  margin-right: 0.5rem;
}

.detail-text {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: var(--color-canvas);
  border-radius: var(--radius-sm);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.9rem;
  line-height: 1.6;
}

.reply-text {
  background: rgba(14, 165, 233, 0.05);
  border-left: 3px solid var(--color-primary);
}

.reply-info {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--color-canvas);
  border-radius: var(--radius-sm);
}

.screenshot-list {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.screenshot-img {
  width: 120px;
  height: 90px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

:deep(.el-table) {
  --el-table-border-color: var(--color-border);
  --el-table-header-bg-color: var(--color-canvas);
  --el-table-row-hover-bg-color: var(--color-surface-soft);
}

:deep(.el-dialog) {
  border-radius: var(--radius-lg);
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 1rem;
}

:deep(.el-dialog__footer) {
  border-top: 1px solid var(--color-border);
  padding-top: 1rem;
}
</style>
