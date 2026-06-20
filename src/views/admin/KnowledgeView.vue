<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">知识库管理</h2>
      <div class="header-actions">
        <el-button @click="syncVector" :loading="syncing">
          {{ syncing ? '同步中...' : '🔄 同步向量库' }}
        </el-button>
        <el-button type="primary" @click="openCreate">+ 新建条目</el-button>
      </div>
    </div>

    <!-- 统计 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-value">{{ stats.total || 0 }}</div>
          <div class="stat-label">总条目</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-value">{{ stats.active || 0 }}</div>
          <div class="stat-label">已启用</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-value">{{ stats.categories || 0 }}</div>
          <div class="stat-label">分类数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-value">{{ stats.vector_store?.total_vectors || 0 }}</div>
          <div class="stat-label">向量数</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-select v-model="filterCategory" placeholder="全部分类" clearable @change="loadData" style="width: 200px;">
        <el-option 
          v-for="cat in categories" 
          :key="cat.name" 
          :label="`${cat.name} (${cat.count})`" 
          :value="cat.name"
        />
      </el-select>
      <el-input 
        v-model="searchKeyword" 
        placeholder="搜索标题/内容..." 
        clearable
        @keyup.enter="loadData"
        style="width: 250px;"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <span class="filter-count">共 {{ total }} 条</span>
    </div>

    <!-- 列表 -->
    <el-card class="table-card" shadow="never">
      <el-table :data="list" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="title" label="标题" min-width="250" show-overflow-tooltip />
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column label="优先级" width="100">
          <template #default="{ row }">
            <el-tag 
              :type="row.priority === 'high' ? 'danger' : row.priority === 'low' ? 'info' : 'warning'" 
              size="small"
            >
              {{ row.priority === 'high' ? '高' : row.priority === 'low' ? '低' : '中' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="view_count" label="查看" width="80" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-state">暂无数据</div>
        </template>
      </el-table>
    </el-card>

    <!-- 分页 -->
    <div v-if="total > pageSize" class="pagination-wrapper">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="loadData"
      />
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog 
      v-model="showModal" 
      :title="editingId ? '编辑知识条目' : '新建知识条目'" 
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form label-width="120px">
        <el-form-item label="分类">
          <el-select v-model="form.category" style="width: 100%;">
            <el-option v-for="cat in allCategories" :key="cat" :label="cat" :value="cat" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="form.title" placeholder="输入标题" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="form.priority">
            <el-radio label="high">高</el-radio>
            <el-radio label="medium">中</el-radio>
            <el-radio label="low">低</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="keywordsStr" placeholder="如：安装,报错,0x80070005（逗号分隔）" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="10"
            placeholder="输入内容（支持 Markdown）..."
            style="font-family: monospace;"
          />
        </el-form-item>
        <el-form-item v-if="editingId" label="状态">
          <el-select v-model="form.status" style="width: 100%;">
            <el-option label="启用" value="active" />
            <el-option label="禁用" value="disabled" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showModal = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">
          {{ submitting ? '保存中...' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { getKnowledgeList, getKnowledgeCategories, getKnowledgeStats, createKnowledge, updateKnowledge, deleteKnowledge, syncKnowledgeVector } from '@/utils/api'
import { showToast } from '@/utils'
import { usePlatformStore } from '@/stores/platform'
import { Search } from '@element-plus/icons-vue'

const platformStore = usePlatformStore()

const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const filterCategory = ref('')
const searchKeyword = ref('')
const categories = ref([])
const stats = ref({})
const showModal = ref(false)
const editingId = ref(null)
const submitting = ref(false)
const syncing = ref(false)
const keywordsStr = ref('')

const allCategories = ['安装教程', '授权说明', '使用教程', '报错处理', '套餐说明', '退款规则', '比赛须知', '其他']

const form = ref({
  category: '安装教程',
  title: '',
  content: '',
  priority: 'medium',
  status: 'active',
  platform_key: '',
  capability_key: '',
})

async function loadData() {
  try {
    const params = { page: page.value, page_size: pageSize }
    if (filterCategory.value) params.category = filterCategory.value
    if (searchKeyword.value) params.keyword = searchKeyword.value
    const pk = platformStore.adminPlatform
    if (pk && pk !== 'all') params.platform_key = pk
    const res = await getKnowledgeList(params)
    list.value = res.items || []
    total.value = res.total || 0
  } catch (err) {
    showToast('加载失败', 'error')
  }
}

async function loadMeta() {
  try {
    const [cats, st] = await Promise.all([getKnowledgeCategories(), getKnowledgeStats()])
    categories.value = cats || []
    stats.value = st || {}
  } catch (err) { /* ignore */ }
}

function openCreate() {
  editingId.value = null
  const pk = platformStore.adminPlatform
  form.value = { category: '安装教程', title: '', content: '', priority: 'medium', status: 'active', platform_key: (pk && pk !== 'all') ? pk : '', capability_key: '' }
  keywordsStr.value = ''
  showModal.value = true
}

function openEdit(item) {
  editingId.value = item.id
  form.value = {
    category: item.category,
    title: item.title,
    content: item.content,
    priority: item.priority,
    status: item.status,
    platform_key: item.platform_key || '',
    capability_key: item.capability_key || '',
  }
  keywordsStr.value = (item.keywords || []).join(', ')
  showModal.value = true
}

async function submitForm() {
  if (!form.value.title.trim()) {
    showToast('请输入标题', 'error')
    return
  }
  if (!form.value.content.trim()) {
    showToast('请输入内容', 'error')
    return
  }
  submitting.value = true
  try {
    const keywords = keywordsStr.value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
    const data = { ...form.value, keywords }
    if (editingId.value) {
      await updateKnowledge(editingId.value, data)
      showToast('更新成功', 'success')
    } else {
      await createKnowledge(data)
      showToast('创建成功', 'success')
    }
    showModal.value = false
    await Promise.all([loadData(), loadMeta()])
  } catch (err) {
    showToast('保存失败', 'error')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(item) {
  if (!confirm(`确定删除「${item.title}」？`)) return
  try {
    await deleteKnowledge(item.id)
    showToast('已删除', 'success')
    await Promise.all([loadData(), loadMeta()])
  } catch (err) {
    showToast('删除失败', 'error')
  }
}

async function syncVector() {
  syncing.value = true
  try {
    const res = await syncKnowledgeVector()
    showToast(`已同步 ${res.synced} 条`, 'success')
    await loadMeta()
  } catch (err) {
    showToast('同步失败', 'error')
  } finally {
    syncing.value = false
  }
}

onMounted(() => {
  loadData()
  loadMeta()
})
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-title {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--studio-text-main);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.stats-row {
  margin-bottom: 1rem;
}

.stat-card {
  background: var(--studio-surface);
  border-radius: var(--radius-lg);
  text-align: center;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--studio-text-main);
}

.stat-label {
  font-size: 0.8rem;
  color: var(--studio-text-muted);
  margin-top: 0.25rem;
}

.filter-bar {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.filter-count {
  font-size: 0.85rem;
  color: var(--studio-text-muted);
}

.table-card {
  background: var(--studio-surface);
  border-radius: var(--radius-lg);
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--studio-text-muted);
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 1rem;
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