<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">功能入口</h2>
      <!-- 搜索框 -->
      <div class="search-box">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input 
          type="text" 
          v-model="searchText" 
          placeholder="搜索工具..." 
          @input="handleSearch"
        />
        <button v-if="searchText" class="clear-btn" @click="clearSearch">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 分类标签 -->
    <div class="category-tabs">
      <button 
        v-for="cat in categories" 
        :key="cat.id"
        :class="['tab-btn', { active: selectedCategory === cat.id }]"
        @click="selectCategory(cat.id)"
      >
        {{ cat.name }}
      </button>
    </div>

    <!-- 工具列表 -->
    <div v-if="filteredTools.length" class="stats-row" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
      <div v-for="tool in filteredTools" :key="tool.name" class="stat-card tool-card" @click="runTool(tool)">
        <div class="tool-header">
          <div class="stat-label">{{ tool.name }}</div>
          <span :class="['status-badge', tool.status === 'online' ? 'online' : 'offline']">
            {{ tool.status === 'online' ? '正常' : '维护中' }}
          </span>
        </div>
        <div class="stat-value" style="font-size: 1.1rem;">{{ tool.module }}</div>
        <div v-if="tool.description" class="tool-desc">{{ tool.description }}</div>
        <div class="tool-footer">
          <span class="tool-category">{{ getCategoryName(tool.category) }}</span>
        </div>
      </div>
    </div>
    
    <!-- 空状态 -->
    <div v-else class="empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
      <p v-if="searchText">未找到匹配 "{{ searchText }}" 的工具</p>
      <p v-else>暂无可用工具</p>
      <button v-if="searchText || selectedCategory !== 'all'" class="reset-btn" @click="resetFilters">
        清除筛选
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getTools, getToolCategories, createLog } from '@/utils/api'
import { runToolSimulation, showToast } from '@/utils'

const tools = ref([])
const categories = ref([
  { id: 'all', name: '全部工具', sort_order: 0 },
  { id: 'data', name: '数据分析', sort_order: 1 },
  { id: 'operation', name: '运营工具', sort_order: 2 },
  { id: 'automation', name: '自动化工具', sort_order: 3 },
  { id: 'other', name: '其他工具', sort_order: 4 },
])
const selectedCategory = ref('all')
const searchText = ref('')
let searchTimer = null

// 筛选后的工具列表
const filteredTools = computed(() => {
  let result = tools.value
  
  // 分类筛选
  if (selectedCategory.value && selectedCategory.value !== 'all') {
    result = result.filter(t => t.category === selectedCategory.value)
  }
  
  // 搜索筛选
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    result = result.filter(t => 
      (t.name || '').toLowerCase().includes(search) ||
      (t.module || '').toLowerCase().includes(search) ||
      (t.description || '').toLowerCase().includes(search)
    )
  }
  
  return result
})

// 加载工具数据
async function loadData() {
  try {
    tools.value = await getTools()
  } catch (err) {
    showToast('工具加载失败', 'error')
  }
}

// 加载分类数据
async function loadCategories() {
  try {
    const cats = await getToolCategories()
    if (cats && cats.length > 0) {
      categories.value = cats
    }
  } catch (err) {
    // 使用默认分类
  }
}

// 选择分类
function selectCategory(catId) {
  selectedCategory.value = catId
}

// 搜索处理（防抖）
function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    // 搜索逻辑在 computed 中处理
  }, 300)
}

// 清除搜索
function clearSearch() {
  searchText.value = ''
}

// 重置筛选
function resetFilters() {
  searchText.value = ''
  selectedCategory.value = 'all'
}

// 获取分类名称
function getCategoryName(catId) {
  const cat = categories.value.find(c => c.id === catId)
  return cat ? cat.name : '未分类'
}

// 运行工具
async function runTool(tool) {
  if (tool.status !== 'online') {
    showToast(`${tool.name} 正在维护中`, 'warning')
    return
  }
  showToast(`正在启动 ${tool.name}...`, 'info')
  runToolSimulation(tool.name)

  // 记录日志
  try {
    const userInfo = JSON.parse(localStorage.getItem('toolbox_user') || '{}')
    await createLog({
      user_id: userInfo.user_id || null,
      device_id: userInfo.device_id || null,
      tool_name: tool.name,
      module: tool.module,
      status: 'success'
    })
  } catch (err) {}
}

onMounted(() => {
  loadData()
  loadCategories()
})
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.page-title {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  color: var(--color-primary);
  margin: 0;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 240px;
  max-width: 320px;
  flex: 1;
}

.search-box svg {
  position: absolute;
  left: 12px;
  width: 18px;
  height: 18px;
  color: var(--color-muted);
  pointer-events: none;
}

.search-box input {
  width: 100%;
  padding: 0.625rem 2.5rem 0.625rem 2.5rem;
  background: white;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  font-size: 0.875rem;
  color: var(--color-foreground);
  transition: all 0.2s;
}

.search-box input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.clear-btn {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--color-muted);
  cursor: pointer;
}

.clear-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--color-foreground);
}

/* 分类标签 */
.category-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.category-tabs::-webkit-scrollbar {
  display: none;
}

.tab-btn {
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-muted);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.tab-btn:hover {
  background: rgba(99, 102, 241, 0.05);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.tab-btn.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

/* 工具卡片 */
.tool-card {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.25rem;
  transition: all 0.2s;
}

.tool-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  border-color: var(--color-accent);
}

.tool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.tool-header .stat-label {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--color-primary);
}

.status-badge {
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
}

.status-badge.online {
  background: rgba(16, 185, 129, 0.1);
  color: #10B981;
}

.status-badge.offline {
  background: rgba(239, 68, 68, 0.1);
  color: #EF4444;
}

.tool-desc {
  font-size: 0.8rem;
  color: var(--color-muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tool-footer {
  margin-top: auto;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}

.tool-category {
  font-size: 0.75rem;
  color: var(--color-accent);
  background: rgba(99, 102, 241, 0.08);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  color: var(--color-muted);
}

.empty-state svg {
  width: 64px;
  height: 64px;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0.5rem 0;
  font-size: 0.9rem;
}

.reset-btn {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover {
  background: var(--color-accent-light);
}

@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
  
  .search-box {
    max-width: none;
  }
}
</style>