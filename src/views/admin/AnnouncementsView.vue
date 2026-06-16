<template>
  <div>
    <h2 class="page-title">公告管理</h2>

    <!-- 发布公告表单 -->
    <div class="table-card" style="margin-bottom: 1.5rem;">
      <div class="table-header">
        <h3>发布公告</h3>
      </div>
      <div class="form-row">
        <input v-model="newAnn.title" class="form-input" placeholder="公告标题" style="flex: 2; min-width: 200px;">
        <select v-model="newAnn.type" class="form-input" style="width: 120px;">
          <option value="system">系统通知</option>
          <option value="update">版本更新</option>
          <option value="activity">活动公告</option>
          <option value="maintenance">维护通知</option>
        </select>
        <input v-model="newAnn.expiresAt" type="datetime-local" class="form-input" style="width: 200px;">
        <button class="btn btn-primary" @click="createAnn" :disabled="isLoading">
          {{ isLoading ? '发布中...' : '发布公告' }}
        </button>
      </div>
      <div class="form-row" style="padding-top: 0;">
        <textarea v-model="newAnn.content" class="form-input" placeholder="公告内容" rows="3" style="width: 100%;"></textarea>
      </div>
    </div>

    <!-- 公告列表 -->
    <section class="table-card">
      <div class="table-header">
        <h3>全部公告</h3>
        <div class="filter-bar">
          <select v-model="filterStatus" class="form-input">
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="expired">已过期</option>
          </select>
        </div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>类型</th>
            <th>状态</th>
            <th>优先级</th>
            <th>过期时间</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ann in filteredAnnouncements" :key="ann.id">
            <td>{{ ann.title }}</td>
            <td>
              <span :class="['badge', getTypeClass(ann.type)]">{{ getTypeText(ann.type) }}</span>
            </td>
            <td>
              <span :class="['badge', getStatusClass(ann.status)]">{{ getStatusText(ann.status) }}</span>
            </td>
            <td>{{ ann.priority }}</td>
            <td>{{ ann.expires_at ? formatDate(ann.expires_at) : '永久' }}</td>
            <td>{{ formatDate(ann.created_at) }}</td>
            <td>
              <button class="btn btn-secondary btn-table" @click="togglePublish(ann)" :disabled="ann.status === 'expired'">
                {{ ann.status === 'published' ? '下架' : '发布' }}
              </button>
              <button class="btn btn-secondary btn-table" @click="editAnn(ann)">编辑</button>
              <button class="btn btn-secondary btn-table" style="color: var(--color-destructive);" @click="deleteAnn(ann.id)">删除</button>
            </td>
          </tr>
          <tr v-if="!filteredAnnouncements.length">
            <td colspan="7" class="empty-row">暂无公告</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 编辑弹窗 -->
    <div class="ann-modal-overlay" :class="{ show: showEditModal }" @click.self="showEditModal = false">
      <div class="ann-modal">
        <div class="ann-modal-header">
          <h3>编辑公告</h3>
          <button class="ann-modal-close" @click="showEditModal = false" aria-label="关闭">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="ann-modal-body">
          <div class="ann-form-group">
            <label>标题</label>
            <input v-model="editingAnn.title" class="form-input" placeholder="请输入标题">
          </div>
          <div class="ann-form-row">
            <div class="ann-form-group" style="flex: 1;">
              <label>类型</label>
          <select v-model="editingAnn.type" class="form-input">
            <option value="system">系统通知</option>
            <option value="update">版本更新</option>
            <option value="activity">活动公告</option>
            <option value="maintenance">维护通知</option>
          </select>
            </div>
            <div class="ann-form-group" style="flex: 1;">
              <label>优先级</label>
              <input v-model.number="editingAnn.priority" type="number" class="form-input" placeholder="0">
            </div>
          </div>
          <div class="ann-form-group">
            <label>内容</label>
            <textarea v-model="editingAnn.content" class="form-input" rows="4" placeholder="请输入公告内容"></textarea>
          </div>
        </div>
        <div class="ann-modal-footer">
          <button class="btn btn-primary" @click="saveEdit" :disabled="isSaving">
            {{ isSaving ? '保存中...' : '保存' }}
          </button>
          <button class="btn btn-secondary" @click="showEditModal = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/utils/api'
import { showToast } from '@/utils'

const announcements = ref([])
const isLoading = ref(false)
const isSaving = ref(false)
const filterStatus = ref('')

const newAnn = ref({ title: '', content: '', type: 'info', expiresAt: '' })

const showEditModal = ref(false)
const editingAnn = ref({ id: null, title: '', content: '', type: 'info', priority: 0 })

const filteredAnnouncements = computed(() => {
  if (!filterStatus.value) return announcements.value
  return announcements.value.filter(a => a.status === filterStatus.value)
})

function getTypeClass(type) {
  const map = { system: 'badge-warning', update: 'badge-success', activity: 'badge-warning', maintenance: 'badge-error' }
  return map[type] || 'badge-warning'
}

function getTypeText(type) {
  const map = { system: '系统通知', update: '版本更新', activity: '活动公告', maintenance: '维护通知' }
  return map[type] || type
}

function getStatusClass(status) {
  const map = { draft: 'badge-warning', published: 'badge-success', expired: 'badge-error' }
  return map[status] || 'badge-warning'
}

function getStatusText(status) {
  const map = { draft: '草稿', published: '已发布', expired: '已过期' }
  return map[status] || status
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

async function loadData() {
  try {
    const res = await getAnnouncements()
    announcements.value = res || []
  } catch (err) {
    showToast('数据加载失败', 'error')
  }
}

async function createAnn() {
  if (!newAnn.value.title || !newAnn.value.content) {
    showToast('请填写标题和内容', 'error')
    return
  }
  isLoading.value = true
  try {
    await createAnnouncement({
      title: newAnn.value.title,
      content: newAnn.value.content,
      type: newAnn.value.type,
      status: 'published',
      expires_at: newAnn.value.expiresAt || null,
    })
    showToast('公告已发布', 'success')
    newAnn.value = { title: '', content: '', type: 'info', expiresAt: '' }
    await loadData()
  } catch (err) {
    showToast(err.message || '发布失败', 'error')
  }
  isLoading.value = false
}

function editAnn(ann) {
  editingAnn.value = {
    id: ann.id,
    title: ann.title || '',
    content: ann.content || '',
    type: ann.type || 'info',
    priority: ann.priority || 0,
  }
  showEditModal.value = true
}

async function saveEdit() {
  if (!editingAnn.value.title || !editingAnn.value.content) {
    showToast('请填写标题和内容', 'error')
    return
  }
  isSaving.value = true
  try {
    await updateAnnouncement(editingAnn.value.id, {
      title: editingAnn.value.title,
      content: editingAnn.value.content,
      type: editingAnn.value.type,
      priority: editingAnn.value.priority,
    })
    showToast('公告已更新', 'success')
    showEditModal.value = false
    await loadData()
  } catch (err) {
    showToast(err.message || '更新失败', 'error')
  }
  isSaving.value = false
}

async function togglePublish(ann) {
  const newStatus = ann.status === 'published' ? 'draft' : 'published'
  try {
    await updateAnnouncement(ann.id, { status: newStatus })
    showToast(newStatus === 'published' ? '公告已发布' : '公告已下架', 'success')
    await loadData()
  } catch (err) {
    showToast(err.message || '操作失败', 'error')
  }
}

async function deleteAnn(id) {
  if (!confirm('确定要删除此公告吗？')) return
  try {
    await deleteAnnouncement(id)
    showToast('公告已删除', 'success')
    await loadData()
  } catch (err) {
    showToast(err.message || '删除失败', 'error')
  }
}

onMounted(loadData)
</script>

<style scoped>
/* 编辑弹窗样式 */
.ann-modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(8px);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}

.ann-modal-overlay.show {
  display: flex;
}

.ann-modal {
  background: white;
  border-radius: 20px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  animation: annModalIn 0.3s ease;
}

@keyframes annModalIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.ann-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.ann-modal-header h3 {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.ann-modal-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--color-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.ann-modal-close:hover {
  background: var(--color-border-light);
  color: var(--color-primary);
}

.ann-modal-body {
  padding: 1.5rem;
}

.ann-form-group {
  margin-bottom: 1rem;
}

.ann-form-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 0.4rem;
}

.ann-form-row {
  display: flex;
  gap: 1rem;
}

.ann-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-border-light);
}

.ann-modal-footer .btn {
  min-width: 80px;
}
</style>