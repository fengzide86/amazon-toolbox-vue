<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
      <h2 class="page-title" style="margin: 0;">
        知识库管理
      </h2>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-secondary" @click="syncVector" :disabled="syncing">
          {{ syncing ? '同步中...' : '🔄 同步向量库' }}
        </button>
        <button class="btn btn-primary" @click="openCreate">+ 新建条目</button>
      </div>
    </div>

    <!-- 统计 -->
    <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total || 0 }}</div>
        <div class="stat-label">总条目</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.active || 0 }}</div>
        <div class="stat-label">已启用</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.categories || 0 }}</div>
        <div class="stat-label">分类数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.vector_store?.total_vectors || 0 }}</div>
        <div class="stat-label">向量数</div>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="filter-bar" style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap;">
      <select v-model="filterCategory" class="form-input" @change="loadData">
        <option value="">全部分类</option>
        <option v-for="cat in categories" :key="cat.name" :value="cat.name">{{ cat.name }} ({{ cat.count }})</option>
      </select>
      <input v-model="searchKeyword" class="form-input" style="min-width:200px;" placeholder="搜索标题/内容..." @keyup.enter="loadData">
      <span style="font-size:0.85rem;color:var(--color-muted);">共 {{ total }} 条</span>
    </div>

    <!-- 列表 -->
    <section class="table-card">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>标题</th>
            <th>分类</th>
            <th>优先级</th>
            <th>状态</th>
            <th>查看</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in list" :key="item.id">
            <td>{{ item.id }}</td>
            <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ item.title }}</td>
            <td>{{ item.category }}</td>
            <td>
              <span :style="{ color: item.priority === 'high' ? '#EF4444' : item.priority === 'low' ? '#9CA3AF' : '#F59E0B', fontWeight: 600, fontSize: '0.8rem' }">
                {{ item.priority === 'high' ? '高' : item.priority === 'low' ? '低' : '中' }}
              </span>
            </td>
            <td>
              <span :class="['status-dot', item.status === 'active' ? 'success' : 'error']"></span>
              {{ item.status === 'active' ? '启用' : '禁用' }}
            </td>
            <td>{{ item.view_count }}</td>
            <td>
              <button class="btn btn-secondary" style="padding:0.3rem 0.6rem;font-size:0.75rem;margin-right:0.3rem;" @click="openEdit(item)">编辑</button>
              <button class="btn" style="padding:0.3rem 0.6rem;font-size:0.75rem;color:#EF4444;" @click="handleDelete(item)">删除</button>
            </td>
          </tr>
          <tr v-if="!list.length">
            <td colspan="7" style="text-align:center;color:var(--color-muted);padding:2rem;">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 分页 -->
    <div v-if="total > pageSize" style="display:flex;justify-content:center;gap:0.5rem;margin-top:1rem;">
      <button class="btn btn-secondary" :disabled="page <= 1" @click="page--; loadData()">上一页</button>
      <span style="line-height:2rem;font-size:0.85rem;color:var(--color-muted);">{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <button class="btn btn-secondary" :disabled="page >= Math.ceil(total / pageSize)" @click="page++; loadData()">下一页</button>
    </div>

    <!-- 编辑弹窗 -->
    <div class="modal-overlay" :class="{ show: showModal }" @click.self="showModal = false">
      <div class="modal modal-large">
        <h3>{{ editingId ? '编辑知识条目' : '新建知识条目' }}</h3>
        <div style="margin-bottom:0.75rem;">
          <label style="display:block;font-size:0.85rem;margin-bottom:0.3rem;color:var(--color-primary);">分类</label>
          <select v-model="form.category" class="form-input">
            <option v-for="cat in allCategories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>
        <div style="margin-bottom:0.75rem;">
          <label style="display:block;font-size:0.85rem;margin-bottom:0.3rem;color:var(--color-primary);">标题</label>
          <input v-model="form.title" class="form-input" placeholder="输入标题">
        </div>
        <div style="margin-bottom:0.75rem;">
          <label style="display:block;font-size:0.85rem;margin-bottom:0.3rem;color:var(--color-primary);">优先级</label>
          <div style="display:flex;gap:1rem;">
            <label><input type="radio" v-model="form.priority" value="high"> 高</label>
            <label><input type="radio" v-model="form.priority" value="medium"> 中</label>
            <label><input type="radio" v-model="form.priority" value="low"> 低</label>
          </div>
        </div>
        <div style="margin-bottom:0.75rem;">
          <label style="display:block;font-size:0.85rem;margin-bottom:0.3rem;color:var(--color-primary);">关键词（逗号分隔）</label>
          <input v-model="keywordsStr" class="form-input" placeholder="如：安装,报错,0x80070005">
        </div>
        <div style="margin-bottom:0.75rem;">
          <label style="display:block;font-size:0.85rem;margin-bottom:0.3rem;color:var(--color-primary);">内容（支持 Markdown）</label>
          <textarea v-model="form.content" class="form-input" rows="10" style="resize:vertical;min-height:200px;font-family:monospace;font-size:0.85rem;" placeholder="输入内容..."></textarea>
        </div>
        <div v-if="editingId" style="margin-bottom:0.75rem;">
          <label style="display:block;font-size:0.85rem;margin-bottom:0.3rem;color:var(--color-primary);">状态</label>
          <select v-model="form.status" class="form-input">
            <option value="active">启用</option>
            <option value="disabled">禁用</option>
          </select>
        </div>
        <div class="modal-btns">
          <button class="btn btn-primary" @click="submitForm" :disabled="submitting">{{ submitting ? '保存中...' : '保存' }}</button>
          <button class="btn btn-secondary" @click="showModal = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getKnowledgeList, getKnowledgeCategories, getKnowledgeStats, createKnowledge, updateKnowledge, deleteKnowledge, syncKnowledgeVector } from '@/utils/api'
import { showToast } from '@/utils'

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
})

async function loadData() {
  try {
    const params = { page: page.value, page_size: pageSize }
    if (filterCategory.value) params.category = filterCategory.value
    if (searchKeyword.value) params.keyword = searchKeyword.value
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
  form.value = { category: '安装教程', title: '', content: '', priority: 'medium', status: 'active' }
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
  }
  keywordsStr.value = (item.keywords || []).join(', ')
  showModal.value = true
}

async function submitForm() {
  if (!form.value.title.trim()) { showToast('请输入标题', 'error'); return }
  if (!form.value.content.trim()) { showToast('请输入内容', 'error'); return }
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

onMounted(() => { loadData(); loadMeta() })
</script>

<style scoped>
.stat-card {
  background: white;
  border-radius: 12px;
  padding: 1rem 1.5rem;
  min-width: 100px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-primary);
}
.stat-label {
  font-size: 0.8rem;
  color: var(--color-muted);
  margin-top: 0.25rem;
}
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
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 25px 50px rgba(0,0,0,0.15);
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
.modal-btns button { flex: 1; padding: 0.75rem; border-radius: 10px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
.status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.status-dot.success { background: #10B981; }
.status-dot.error { background: #EF4444; }
</style>