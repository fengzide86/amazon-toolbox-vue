<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">功能入口</h2>
      <!-- 搜索框 -->
        <div class="search-box">
          <Search :size="18" />
        <input 
          type="text" 
          v-model="searchText" 
          placeholder="搜索工具..." 
          @input="handleSearch"
        />
          <button v-if="searchText" class="clear-btn" @click="clearSearch">
            <X :size="16" />
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
      <div 
        v-for="tool in filteredTools" 
        :key="tool.name" 
        :class="['stat-card', 'tool-card', { launching: launchingToolId === tool.id }]"
        :data-testid="'tool-card-' + tool.name" 
        @click="runTool(tool)"
      >
        <div class="tool-header">
          <div class="stat-label">{{ tool.name }}</div>
          <span v-if="launchingToolId === tool.id" class="launching-badge">
            <span class="launching-spinner"></span> 启动中...
          </span>
          <span v-else :class="['status-badge', tool.status === 'online' ? 'online' : 'offline']">
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
        <Search :size="48" :stroke-width="1.5" />
      <p v-if="searchText">未找到匹配 "{{ searchText }}" 的工具</p>
      <p v-else>暂无可用工具</p>
      <button v-if="searchText || selectedCategory !== 'all'" class="reset-btn" @click="resetFilters">
        清除筛选
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { getTools, getToolCategories, createLog } from '@/utils/api'
import { runToolSimulation, showToast } from '@/utils'
import { usePlatformStore } from '@/stores/platform'
import { useAppStore } from '@/stores/app'
import { Search, X } from '@lucide/vue'

const platformStore = usePlatformStore()
const appStore = useAppStore()
const tools = ref([])
const launchingToolId = ref(null)
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
  
  // 速卖通平台下过滤掉 FBA/AGL
  if (platformStore.currentPlatform === 'aliexpress') {
    result = result.filter(t => t.capability_key !== 'fba_agl')
  }
  
  return result
})

// 加载工具数据
async function loadData() {
  try {
    const params = {
      platform_key: platformStore.currentPlatform
    }
    tools.value = await getTools(params)
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

// 检查平台权限
function checkPlatformPermission() {
  // 优先从登录时存储的 JSON 数组读取
  try {
    const scope = localStorage.getItem('toolbox_platform_scope')
    if (scope) {
      const parsed = JSON.parse(scope)
      if (Array.isArray(parsed)) return platformStore.hasPlatformPermission(parsed.join(','), platformStore.currentPlatform)
    }
  } catch (e) {}
  // 兼容旧格式
  try {
    const authData = JSON.parse(localStorage.getItem('toolbox_auth') || '{}')
    if (authData.platform_scope) {
      const scope = Array.isArray(authData.platform_scope)
        ? authData.platform_scope.join(',')
        : authData.platform_scope
      return platformStore.hasPlatformPermission(scope, platformStore.currentPlatform)
    }
  } catch (e) {}
  return true
}

// 运行工具（调用 launch-token 接口）
async function runTool(tool) {
  if (tool.status !== 'online' && tool.status !== 'available' && tool.status !== 'beta') {
    showToast(`${tool.name} 正在维护中`, 'warning')
    return
  }
  
  // 检查平台权限
  if (!checkPlatformPermission()) {
    showToast('当前授权暂未包含该平台，如需使用请升级授权', 'error')
    return
  }
  
  const platformKey = platformStore.currentPlatform
  const deviceId = localStorage.getItem('toolbox_device_id') || ''
  
  showToast(`正在启动 ${tool.name}...`, 'info')
  
  try {
    // 调用 launch-token 接口
    const response = await fetch(
      `${import.meta.env.DEV ? 'http://localhost:8000' : ''}/api/tools/${tool.id}/launch-token?platform_key=${platformKey}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('toolbox_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform_key: platformKey,
          device_id: deviceId,
        }),
      }
    )
    
    const result = await response.json()
    
    if (result.success && result.data && result.data.launch_data) {
      const ld = result.data.launch_data
      const targetUrl = ld.target_url || ''
      
      // 检查目标网址是否配置
      if (!targetUrl) {
        showToast('该工具暂未配置目标网址，请联系管理员', 'warning')
        launchingToolId.value = null
        return
      }
      
      // 打开工具（分屏模式）
      launchingToolId.value = tool.id
      
      appStore.openTool({
        id: ld.tool_id || tool.id,
        name: ld.tool_name || tool.name,
        module: ld.tool_module || tool.module,
        category: ld.category || tool.category,
        platformKey: ld.platform_key || platformKey,
        targetUrl: targetUrl
      })
      
      launchingToolId.value = null
      showToast(`${tool.name} 已启动`, 'success')
    } else {
      // 显示后端错误文案
      const errorMsg = result.message || '启动失败'
      showToast(errorMsg, 'error')
    }
  } catch (err) {
    showToast('网络连接失败，请检查后端服务', 'error')
  }

  // 记录日志
  try {
    const userInfo = JSON.parse(localStorage.getItem('toolbox_user') || '{}')
    await createLog({
      user_id: userInfo.user_id || null,
      device_id: deviceId,
      tool_name: tool.name,
      module: tool.module,
      status: 'success',
      platform_key: platformKey,
      capability_key: tool.capability_key,
      tool_id: tool.id
    })
  } catch (err) {}
}

// 监听 Electron 工具启动结果
function setupElectronListeners() {
  if (!window.electronAPI) return
  
  window.electronAPI.onLaunchToolSuccess?.((data) => {
    launchingToolId.value = null
    showToast(`${data.toolName || '工具'} 已启动`, 'success')
  })
  
  window.electronAPI.onLaunchToolError?.((data) => {
    launchingToolId.value = null
    showToast(data.message || '工具启动失败', 'error')
  })
}

// 监听平台变化
watch(() => platformStore.currentPlatform, () => {
  loadData()
})

onMounted(() => {
  loadData()
  loadCategories()
  setupElectronListeners()
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
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
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
  background: rgba(14, 165, 233, 0.05);
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
  color: var(--studio-success);
}

.status-badge.offline {
  background: rgba(239, 68, 68, 0.1);
  color: var(--studio-danger);
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
  background: rgba(14, 165, 233, 0.08);
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

/* 启动中状态 */
.tool-card.launching {
  opacity: 0.7;
  pointer-events: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.15);
}

.launching-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
  background: rgba(14, 165, 233, 0.1);
  color: var(--color-accent);
}

.launching-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid var(--color-accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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