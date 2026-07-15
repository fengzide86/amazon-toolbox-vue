<template>
  <div>
    <PageHeader title="公告管理" description="发布并维护用户端公告" />

    <!-- 发布公告表单 -->
    <el-card class="form-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>发布公告</span>
        </div>
      </template>
      <el-form label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="newAnn.title" placeholder="公告标题" style="flex: 2; min-width: 200px;" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="newAnn.type" style="width: 120px;">
            <el-option label="系统通知" value="system" />
            <el-option label="版本更新" value="update" />
            <el-option label="活动公告" value="activity" />
            <el-option label="维护通知" value="maintenance" />
          </el-select>
        </el-form-item>
        <el-form-item label="过期时间">
          <el-date-picker
            v-model="newAnn.expiresAt"
            type="datetime"
            placeholder="选择过期时间"
            style="width: 200px;"
          />
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="newAnn.content"
            type="textarea"
            :rows="3"
            placeholder="公告内容"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="createAnn" :loading="isLoading">
            {{ isLoading ? '发布中...' : '发布公告' }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 公告列表 -->
    <el-card class="table-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>全部公告</span>
        </div>
      </template>
      <DataToolbar label="公告筛选">
        <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 150px;">
          <el-option label="全部状态" value="" />
          <el-option label="草稿" value="draft" />
          <el-option label="已发布" value="published" />
          <el-option label="已过期" value="expired" />
        </el-select>
        <template #summary>共 {{ filteredAnnouncements.length }} 条</template>
      </DataToolbar>
      <el-table :data="filteredAnnouncements" stripe style="width: 100%">
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column v-if="!isCompact" label="类型" width="120">
          <template #default="{ row }">
            <el-tag :type="getTypeTagType(row.type)" size="small">
              {{ getTypeText(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="!isCompact" prop="priority" label="优先级" width="80" />
        <el-table-column v-if="!isCompact" label="过期时间" width="160">
          <template #default="{ row }">
            <span class="time-text">{{ row.expires_at ? formatDate(row.expires_at) : '永久' }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="!isCompact" label="创建时间" width="160">
          <template #default="{ row }">
            <span class="time-text">{{ formatDate(row.created_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" :width="isCompact ? 136 : 200" fixed="right">
          <template #default="{ row }">
            <template v-if="isCompact">
              <el-button size="small" @click="openAnnDetail(row)">详情</el-button>
              <el-dropdown trigger="click" @command="command => handleAnnCommand(command, row)">
                <el-button size="small">更多</el-button>
                <template #dropdown><el-dropdown-menu><el-dropdown-item command="publish" :disabled="row.status === 'expired'">{{ row.status === 'published' ? '下架' : '发布' }}</el-dropdown-item><el-dropdown-item command="edit">编辑</el-dropdown-item><el-dropdown-item command="delete" divided>删除</el-dropdown-item></el-dropdown-menu></template>
              </el-dropdown>
            </template>
            <template v-else>
              <el-button size="small" @click="togglePublish(row)" :disabled="row.status === 'expired'">{{ row.status === 'published' ? '下架' : '发布' }}</el-button>
              <el-button size="small" @click="editAnn(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="deleteAnn(row.id)">删除</el-button>
            </template>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-state">暂无公告</div>
        </template>
      </el-table>
    </el-card>

    <AdminDetailDrawer v-model="showDetailDrawer" title="公告详情">
      <div v-if="detailAnn" class="detail-list">
        <div><span>标题</span><strong>{{ detailAnn.title }}</strong></div>
        <div><span>类型</span><strong>{{ getTypeText(detailAnn.type) }}</strong></div>
        <div><span>状态</span><strong>{{ getStatusText(detailAnn.status) }}</strong></div>
        <div><span>优先级</span><strong>{{ detailAnn.priority || 0 }}</strong></div>
        <div><span>过期时间</span><strong>{{ detailAnn.expires_at ? formatDate(detailAnn.expires_at) : '永久' }}</strong></div>
        <div class="detail-content"><span>内容</span><p>{{ detailAnn.content }}</p></div>
      </div>
      <template #footer><el-button @click="showDetailDrawer = false">关闭</el-button></template>
    </AdminDetailDrawer>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="showEditModal" title="编辑公告" width="500px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="editingAnn.title" placeholder="请输入标题" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="editingAnn.type" style="width: 100%;">
            <el-option label="系统通知" value="system" />
            <el-option label="版本更新" value="update" />
            <el-option label="活动公告" value="activity" />
            <el-option label="维护通知" value="maintenance" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="editingAnn.priority" :min="0" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="editingAnn.content"
            type="textarea"
            :rows="4"
            placeholder="请输入公告内容"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditModal = false">取消</el-button>
        <el-button type="primary" @click="saveEdit" :loading="isSaving">
          {{ isSaving ? '保存中...' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/utils/api'
import { showToast } from '@/utils'
import DataToolbar from '@/components/DataToolbar.vue'
import PageHeader from '@/components/PageHeader.vue'
import AdminDetailDrawer from '@/components/AdminDetailDrawer.vue'
import { useCompactLayout } from '@/composables/useCompactLayout'

const announcements = ref([])
const isLoading = ref(false)
const isSaving = ref(false)
const filterStatus = ref('')
const isCompact = useCompactLayout()
const showDetailDrawer = ref(false)
const detailAnn = ref(null)

const newAnn = ref({ title: '', content: '', type: 'info', expiresAt: '' })

const showEditModal = ref(false)
const editingAnn = ref({ id: null, title: '', content: '', type: 'info', priority: 0 })

const filteredAnnouncements = computed(() => {
  if (!filterStatus.value) return announcements.value
  return announcements.value.filter(a => a.status === filterStatus.value)
})

function getTypeTagType(type) {
  const map = { system: 'warning', update: 'success', activity: 'warning', maintenance: 'danger' }
  return map[type] || 'warning'
}

function getTypeText(type) {
  const map = { system: '系统通知', update: '版本更新', activity: '活动公告', maintenance: '维护通知' }
  return map[type] || type
}

function getStatusTagType(status) {
  const map = { draft: 'warning', published: 'success', expired: 'danger' }
  return map[status] || 'warning'
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

function openAnnDetail(ann) {
  detailAnn.value = ann
  showDetailDrawer.value = true
}

function handleAnnCommand(command, ann) {
  if (command === 'publish') togglePublish(ann)
  if (command === 'edit') editAnn(ann)
  if (command === 'delete') deleteAnn(ann.id)
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
.form-card,
.table-card {
  background: var(--studio-surface);
  border-radius: var(--radius-lg);
  margin-bottom: 1.5rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header span {
  font-size: 1rem;
  font-weight: 600;
  color: var(--studio-text-main);
}

.data-toolbar-v6 { margin-bottom: 1rem; }

.detail-list { display: grid; gap: 12px; }
.detail-list > div { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--studio-border); }
.detail-list span { color: var(--studio-text-muted); font-size: 13px; }
.detail-list strong { color: var(--studio-text-main); overflow-wrap: anywhere; }
.detail-content { grid-template-columns: 1fr !important; }
.detail-content p { margin: 0; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }

.time-text {
  font-size: 0.85rem;
  color: var(--studio-text-muted);
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--studio-text-muted);
}

:deep(.el-table) {
  --el-table-border-color: var(--studio-border);
  --el-table-header-bg-color: var(--studio-bg);
  --el-table-row-hover-bg-color: var(--studio-bg-hover);
}

:deep(.el-dialog) {
  border-radius: var(--radius-lg);
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid var(--studio-border);
  padding-bottom: 1rem;
}

:deep(.el-dialog__footer) {
  border-top: 1px solid var(--studio-border);
  padding-top: 1rem;
}
</style>
