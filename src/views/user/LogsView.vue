<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">个人日志与问题反馈</h2>
    </div>

    <section class="table-card">
      <div class="table-header">
        <h3>运行日志</h3>
        <button class="btn btn-secondary" @click="exportLogsData" :disabled="!logs.length">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          导出 CSV
        </button>
      </div>
      
      <div class="filters">
        <div class="filter-group">
          <label>开始日期</label>
          <input type="date" v-model="filters.startDate" @change="loadLogs">
        </div>
        <div class="filter-group">
          <label>结束日期</label>
          <input type="date" v-model="filters.endDate" @change="loadLogs">
        </div>
        <div class="filter-group">
          <label>工具名称</label>
          <select v-model="filters.toolName" @change="loadLogs">
            <option value="">全部工具</option>
            <option v-for="tool in toolOptions" :key="tool" :value="tool">{{ tool }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label>状态</label>
          <select v-model="filters.status" @change="loadLogs">
            <option value="">全部状态</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
          </select>
        </div>
        <button class="btn btn-secondary" @click="resetFilters">重置</button>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">时间</th>
            <th scope="col">工具</th>
            <th scope="col">模块</th>
            <th scope="col">状态</th>
            <th scope="col">详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td>{{ formatTime(log.created_at) }}</td>
            <td>{{ log.tool_name || '-' }}</td>
            <td>{{ log.module || '-' }}</td>
            <td>
              <span :class="['status-badge', log.status === 'success' ? 'success' : 'error']">
                {{ log.status === 'success' ? '成功' : '失败' }}
              </span>
            </td>
            <td>{{ log.detail || log.error_code || '-' }}</td>
          </tr>
          <tr v-if="!logs.length">
            <td colspan="5" class="empty-row">暂无运行日志</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="table-card" style="margin-top: 1.5rem;">
      <div class="table-header">
        <h3>问题反馈</h3>
      </div>
      <div class="feedback-form">
        <div class="form-row">
          <input v-model="feedbackTitle" class="form-input" placeholder="问题标题 *">
          <button class="btn btn-primary" @click="submitFeedback" :disabled="!feedbackTitle.trim() || submitting">
            {{ submitting ? '提交中...' : '提交反馈' }}
          </button>
        </div>
        <textarea v-model="feedbackContent" class="form-textarea" placeholder="问题描述（选填）" rows="3"></textarea>
        
        <div class="screenshot-section">
          <label class="screenshot-label">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            添加截图（可选）
          </label>
          <div class="screenshot-upload">
            <input type="file" ref="fileInput" multiple accept="image/*" @change="handleFileSelect" style="display:none;">
            <div v-if="screenshots.length === 0" class="upload-area" @click="triggerFileInput">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              <span>点击上传截图</span>
            </div>
            <div v-else class="preview-list">
              <div v-for="(img, index) in screenshots" :key="index" class="preview-item">
                <img :src="img.preview" alt="截图预览">
                <button class="remove-btn" @click="removeScreenshot(index)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div class="preview-item add-more" @click="triggerFileInput">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="myFeedbacks.length" class="feedback-list">
        <h4>我的反馈记录</h4>
        <div v-for="fb in myFeedbacks" :key="fb.id" class="feedback-item">
          <div class="feedback-header">
            <strong>{{ fb.title }}</strong>
            <span :class="['status-badge', fb.status]">{{ getStatusText(fb.status) }}</span>
          </div>
          <div class="feedback-content">{{ fb.content || '无描述' }}</div>
          <div v-if="fb.screenshots" class="feedback-screenshots">
            <img v-for="(url, i) in parseScreenshots(fb.screenshots)" :key="i" :src="url" alt="反馈截图" @click="previewImage(url)">
          </div>
          <div v-if="fb.admin_reply" class="admin-reply">
            <strong>管理员回复：</strong>
            <span>{{ fb.admin_reply }}</span>
          </div>
        </div>
      </div>
    </section>

    <div v-if="previewUrl" class="image-preview-overlay" @click="previewUrl = null">
      <img :src="previewUrl" @click.stop>
      <button class="close-preview" @click="previewUrl = null">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { getLogs, getLogTools, exportLogs, createFeedback, getMyFeedbacks, API_BASE } from '@/utils/api'
import { showToast } from '@/utils'
import { usePlatformStore } from '@/stores/platform'

const platformStore = usePlatformStore()
const logs = ref([])
const myFeedbacks = ref([])
const feedbackTitle = ref('')
const feedbackContent = ref('')
const screenshots = ref([])
const submitting = ref(false)
const toolOptions = ref([])
const previewUrl = ref(null)
const fileInput = ref(null)

const filters = ref({
  startDate: '',
  endDate: '',
  toolName: '',
  status: ''
})

function formatTime(timeStr) {
  if (!timeStr) return '-'
  const d = new Date(timeStr)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function getStatusText(status) {
  const map = { pending: '待处理', processing: '处理中', resolved: '已解决' }
  return map[status] || status
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
  previewUrl.value = url
}

function triggerFileInput() {
  fileInput.value?.click()
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files)
  files.forEach(file => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        screenshots.value.push({
          file: file,
          preview: ev.target.result
        })
      }
      reader.readAsDataURL(file)
    }
  })
  e.target.value = ''
}

function removeScreenshot(index) {
  screenshots.value.splice(index, 1)
}

async function submitFeedback() {
  if (!feedbackTitle.value.trim()) { 
    showToast('请输入标题', 'error')
    return 
  }
  
  submitting.value = true
  try {
    const userInfo = JSON.parse(localStorage.getItem('toolbox_user') || '{}')
    
    const formData = new FormData()
    formData.append('title', feedbackTitle.value.trim())
    formData.append('content', feedbackContent.value.trim())
    formData.append('platform_key', platformStore.currentPlatform)
    if (userInfo.user_id) formData.append('user_id', userInfo.user_id)
    
    screenshots.value.forEach(item => {
      formData.append('screenshots', item.file)
    })
    
    const token = localStorage.getItem('toolbox_token')
    const response = await fetch(`${API_BASE}/api/feedback`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData
    })
    
    if (!response.ok) throw new Error('提交失败')
    
    showToast('反馈已提交', 'success')
    feedbackTitle.value = ''
    feedbackContent.value = ''
    screenshots.value = []
    await loadFeedbacks()
  } catch (err) {
    showToast('提交失败', 'error')
  } finally {
    submitting.value = false
  }
}

async function loadLogs() {
  try {
    const params = { platform_key: platformStore.currentPlatform }
    if (filters.value.startDate) params.start_date = filters.value.startDate
    if (filters.value.endDate) params.end_date = filters.value.endDate
    if (filters.value.toolName) params.tool_name = filters.value.toolName
    if (filters.value.status) params.status = filters.value.status
    
    logs.value = await getLogs(params)
  } catch (err) {
    showToast('日志加载失败', 'error')
  }
}

async function loadToolOptions() {
  try {
    toolOptions.value = await getLogTools()
  } catch (err) {}
}

function resetFilters() {
  filters.value = { startDate: '', endDate: '', toolName: '', status: '' }
  loadLogs()
}

async function exportLogsData() {
  try {
    const params = { platform_key: platformStore.currentPlatform }
    if (filters.value.startDate) params.start_date = filters.value.startDate
    if (filters.value.endDate) params.end_date = filters.value.endDate
    if (filters.value.toolName) params.tool_name = filters.value.toolName
    if (filters.value.status) params.status = filters.value.status
    
    const blob = await exportLogs(params)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('导出成功', 'success')
  } catch (err) {
    showToast('导出失败', 'error')
  }
}

async function loadFeedbacks() {
  try {
    myFeedbacks.value = await getMyFeedbacks()
  } catch (err) {}
}

watch(() => platformStore.currentPlatform, () => { loadLogs() })

onMounted(() => { 
  loadLogs()
  loadFeedbacks()
  loadToolOptions()
})
</script>

<style scoped>
.page-header { margin-bottom: 1.5rem; }
.page-title { font-family: var(--font-heading); font-size: 1.5rem; color: var(--color-primary); margin: 0; }

.filters { display: flex; gap: 1rem; padding: 1rem 1.5rem; background: #f8fafc; border-radius: 12px; margin-bottom: 1rem; flex-wrap: wrap; align-items: flex-end; }
.filter-group { display: flex; flex-direction: column; gap: 0.25rem; }
.filter-group label { font-size: 0.75rem; color: var(--color-muted); font-weight: 500; }
.filter-group input, .filter-group select { padding: 0.5rem 0.75rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.85rem; background: white; min-width: 120px; }

.status-badge { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
.status-badge.success { background: rgba(16, 185, 129, 0.1); color: #10B981; }
.status-badge.error { background: rgba(239, 68, 68, 0.1); color: #EF4444; }
.status-badge.pending { background: rgba(245, 158, 11, 0.1); color: #F59E0B; }
.status-badge.processing { background: rgba(99, 102, 241, 0.1); color: #6366F1; }
.status-badge.resolved { background: rgba(16, 185, 129, 0.1); color: #10B981; }
.empty-row { text-align: center; color: var(--color-muted); padding: 2rem; }

.feedback-form { padding: 1.5rem; border-bottom: 1px solid var(--color-border); }
.form-row { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
.form-input { flex: 1; min-width: 200px; padding: 0.6rem 1rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.9rem; }
.form-textarea { width: 100%; padding: 0.6rem 1rem; border: 1px solid var(--color-border); border-radius: 8px; font-size: 0.9rem; resize: vertical; margin-bottom: 1rem; }

.screenshot-section { margin-top: 1rem; }
.screenshot-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--color-muted); margin-bottom: 0.5rem; }
.upload-area { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 2rem; border: 2px dashed var(--color-border); border-radius: 12px; cursor: pointer; transition: all 0.2s; color: var(--color-muted); }
.upload-area:hover { border-color: var(--color-accent); background: rgba(99, 102, 241, 0.02); }
.preview-list { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.preview-item { position: relative; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; border: 1px solid var(--color-border); }
.preview-item img { width: 100%; height: 100%; object-fit: cover; }
.preview-item.add-more { display: flex; align-items: center; justify-content: center; cursor: pointer; background: #f8fafc; color: var(--color-muted); }
.preview-item.add-more:hover { background: rgba(99, 102, 241, 0.05); color: var(--color-accent); }
.remove-btn { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.5); border: none; border-radius: 50%; color: white; cursor: pointer; }

.feedback-list { padding: 1.5rem; }
.feedback-list h4 { margin-bottom: 1rem; color: var(--color-primary); }
.feedback-item { padding: 1rem; background: #f8fafc; border-radius: 12px; margin-bottom: 0.75rem; }
.feedback-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.feedback-content { font-size: 0.85rem; color: var(--color-muted); margin-bottom: 0.75rem; }
.feedback-screenshots { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.feedback-screenshots img { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 1px solid var(--color-border); }
.feedback-screenshots img:hover { opacity: 0.8; }
.admin-reply { padding: 0.75rem; background: rgba(99, 102, 241, 0.05); border-radius: 8px; font-size: 0.85rem; }
.admin-reply strong { color: var(--color-accent); }

.image-preview-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 2rem; }
.image-preview-overlay img { max-width: 90%; max-height: 90%; border-radius: 8px; }
.close-preview { position: absolute; top: 1rem; right: 1rem; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.1); border: none; border-radius: 50%; color: white; cursor: pointer; }
.close-preview:hover { background: rgba(255, 255, 255, 0.2); }

@media (max-width: 640px) {
  .filters { flex-direction: column; align-items: stretch; }
  .filter-group input, .filter-group select { width: 100%; }
}
</style>