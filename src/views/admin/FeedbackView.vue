<template>
  <div>
    <h2 style="font-family: var(--font-heading); font-size: 1.5rem; color: var(--color-primary); margin-bottom: 1.5rem;">
      工单管理
    </h2>

    <div class="filter-bar" style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap;">
      <select v-model="filterStatus" class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.85rem;">
        <option value="">全部状态</option>
        <option value="pending">待处理</option>
        <option value="processing">处理中</option>
        <option value="resolved">已解决</option>
      </select>
      <span style="font-size:0.85rem;color:var(--color-muted);">共 {{ filteredFeedbacks.length }} 个工单</span>
    </div>

    <section class="table-card">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>标题</th>
            <th>用户ID</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="fb in filteredFeedbacks" :key="fb.id">
            <td>{{ fb.id }}</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ fb.title || '-' }}</td>
            <td>{{ fb.user_id || '-' }}</td>
            <td>
              <span :class="['status-dot', getStatusClass(fb.status)]"></span>
              {{ getStatusText(fb.status) }}
            </td>
            <td>{{ formatTime(fb.created_at) }}</td>
            <td>
              <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; margin-right: 0.3rem;"
                @click="viewDetail(fb)">
                查看
              </button>
              <button class="btn btn-primary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;"
                @click="openReply(fb)" :disabled="fb.status === 'resolved'">
                {{ fb.status === 'pending' ? '处理' : '回复' }}
              </button>
            </td>
          </tr>
          <tr v-if="!filteredFeedbacks.length">
            <td colspan="6" style="text-align:center;color:var(--color-muted);padding:2rem;">暂无工单数据</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 查看详情弹窗 -->
    <div class="modal-overlay" :class="{ show: showDetailModal }" @click.self="showDetailModal = false">
      <div class="modal modal-large">
        <h3>工单详情</h3>
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
            <span :class="['status-dot', getStatusClass(currentFeedback?.status)]"></span>
            {{ getStatusText(currentFeedback?.status) }}
          </div>
          <div class="detail-row">
            <span class="detail-label">创建时间：</span>
            <span>{{ formatTime(currentFeedback?.created_at) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">内容：</span>
            <p class="detail-text">{{ currentFeedback?.content || '无内容' }}</p>
          </div>
          <div class="detail-row" v-if="currentFeedback?.screenshots">
            <span class="detail-label">截图：</span>
            <div class="screenshot-list">
              <img v-for="(url, index) in parseScreenshots(currentFeedback.screenshots)" :key="index" :src="url" alt="截图" class="screenshot-img" @click="previewImage(url)">
            </div>
          </div>
          <div class="detail-row" v-if="currentFeedback?.admin_reply">
            <span class="detail-label">管理员回复：</span>
            <p class="detail-text reply-text">{{ currentFeedback.admin_reply }}</p>
          </div>
        </div>
        <div class="modal-btns">
          <button class="btn btn-secondary" @click="showDetailModal = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 回复弹窗 -->
    <div class="modal-overlay" :class="{ show: showReplyModal }" @click.self="showReplyModal = false">
      <div class="modal">
        <h3>{{ currentFeedback?.status === 'pending' ? '处理工单' : '回复工单' }}</h3>
        <p style="color: var(--color-muted); font-size: 0.85rem; margin-bottom: 1rem;">
          工单：{{ currentFeedback?.title }}
        </p>
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; margin-bottom: 0.5rem; color: var(--color-primary);">状态：</label>
          <select v-model="replyStatus" class="btn btn-secondary" style="width: 100%; padding: 0.6rem 1rem; text-align: left;">
            <option value="processing">处理中</option>
            <option value="resolved">已解决</option>
          </select>
        </div>
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; margin-bottom: 0.5rem; color: var(--color-primary);">回复内容：</label>
          <textarea v-model="replyContent" class="btn btn-secondary" rows="4" 
            style="width: 100%; padding: 0.6rem 1rem; text-align: left; resize: vertical; min-height: 100px;"
            placeholder="请输入回复内容..."></textarea>
        </div>
        <div class="modal-btns">
          <button class="btn btn-primary" @click="submitReply" :disabled="isSubmitting">
            {{ isSubmitting ? '提交中...' : '提交' }}
          </button>
          <button class="btn btn-secondary" @click="showReplyModal = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 图片预览弹窗 -->
    <div class="modal-overlay" :class="{ show: showImageModal }" @click.self="showImageModal = false">
      <div class="modal modal-image">
        <img :src="previewImageUrl" alt="预览" style="max-width: 100%; max-height: 80vh; object-fit: contain;">
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getFeedbacks, updateFeedback, API_BASE } from '@/utils/api'
import { showToast } from '@/utils'

const feedbacks = ref([])
const filterStatus = ref('')
const showDetailModal = ref(false)
const showReplyModal = ref(false)
const showImageModal = ref(false)
const currentFeedback = ref(null)
const replyStatus = ref('processing')
const replyContent = ref('')
const isSubmitting = ref(false)
const previewImageUrl = ref('')

const filteredFeedbacks = computed(() => {
  if (!filterStatus.value) return feedbacks.value
  return feedbacks.value.filter(f => f.status === filterStatus.value)
})

function getStatusClass(status) {
  const map = { pending: 'warning', processing: 'info', resolved: 'success' }
  return map[status] || 'warning'
}

function getStatusText(status) {
  const map = { pending: '待处理', processing: '处理中', resolved: '已解决' }
  return map[status] || status
}

function formatTime(timeStr) {
  if (!timeStr) return '-'
  const d = new Date(timeStr)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function viewDetail(fb) {
  currentFeedback.value = fb
  showDetailModal.value = true
}

function openReply(fb) {
  currentFeedback.value = fb
  replyStatus.value = fb.status === 'pending' ? 'processing' : fb.status
  replyContent.value = fb.admin_reply || ''
  showReplyModal.value = true
}

async function submitReply() {
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

function parseScreenshots(screenshotsStr) {
  if (!screenshotsStr) return []
  try {
    const urls = typeof screenshotsStr === 'string' ? JSON.parse(screenshotsStr) : screenshotsStr
    return urls.map(url => url.startsWith('http') ? url : `${API_BASE}${url}`)
  } catch {
    return []
  }
}

function previewImage(url) {
  previewImageUrl.value = url
  showImageModal.value = true
}

async function loadData() {
  try {
    feedbacks.value = await getFeedbacks()
  } catch (err) {
    showToast('数据加载失败', 'error')
  }
}

onMounted(loadData)
</script>

<style scoped>
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(15,23,42,0.5);
  backdrop-filter: blur(5px);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}
.modal-overlay.show { display: flex; }
.modal {
  background: white;
  border-radius: 20px;
  padding: 2rem;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 25px 50px rgba(0,0,0,0.15);
}
.modal-large {
  max-width: 600px;
}
.modal-image {
  max-width: 90vw;
  max-height: 90vh;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal h3 {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: var(--color-primary);
}
.modal-btns {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}
.modal-btns button {
  flex: 1;
  padding: 0.75rem;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
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
  color: var(--color-primary);
  margin-right: 0.5rem;
}
.detail-text {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: #f8fafc;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.9rem;
  line-height: 1.6;
}
.reply-text {
  background: rgba(99,102,241,0.05);
  border-left: 3px solid var(--color-accent);
}
.screenshot-list {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}
.screenshot-img {
  max-width: 200px;
  max-height: 150px;
  border-radius: 8px;
  cursor: pointer;
  object-fit: cover;
  border: 1px solid var(--color-border);
  transition: opacity 0.2s;
}
.screenshot-img:hover {
  opacity: 0.8;
}
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}
.status-dot.warning { background: #F59E0B; }
.status-dot.info { background: #3B82F6; }
.status-dot.success { background: #10B981; }
.status-dot.error { background: #EF4444; }
</style>