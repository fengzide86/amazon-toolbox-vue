<template>
  <div>
    <h2 class="page-title">系统设置</h2>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>基本设置</span>
        </div>
      </template>

      <el-form label-position="top">
        <el-form-item>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">管理员密码</div>
              <div class="setting-desc">用于管理后台登录</div>
            </div>
            <div class="setting-control">
              <el-input 
                v-model="adminPassword" 
                type="password" 
                placeholder="新密码" 
                style="width: 200px;"
                show-password
              />
              <el-button type="primary" @click="savePassword">更新密码</el-button>
            </div>
          </div>
        </el-form-item>

        <el-form-item>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">客服微信</div>
              <div class="setting-desc">显示在登录页和帮助页面</div>
            </div>
            <div class="setting-control">
              <el-input 
                v-model="wechatId" 
                placeholder="客服微信号" 
                style="width: 250px;"
              />
              <el-button type="primary" @click="saveWechat">保存</el-button>
            </div>
          </div>
        </el-form-item>

        <el-form-item>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">分润比例</div>
              <div class="setting-desc">{{ profitRatiosText }}</div>
            </div>
            <div class="setting-control">
              <el-button @click="openProfitEdit">编辑</el-button>
            </div>
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>套餐管理</span>
          <el-button type="primary" size="small" @click="showAddPlan = true">+ 新增套餐</el-button>
        </div>
      </template>

      <el-table :data="plans" style="width: 100%">
        <el-table-column label="套餐名称" min-width="140">
          <template #default="{ row }">
            <el-input 
              v-if="editingPlan?.id === row.id" 
              v-model="editingPlan.name" 
              size="small"
            />
            <span v-else>{{ row.name }}</span>
          </template>
        </el-table-column>

        <el-table-column label="价格" width="120">
          <template #default="{ row }">
            <el-input-number 
              v-if="editingPlan?.id === row.id" 
              v-model="editingPlan.price" 
              size="small"
              :min="0"
              style="width: 100px;"
            />
            <span v-else>¥{{ row.price }}</span>
          </template>
        </el-table-column>

        <el-table-column label="有效期" width="120">
          <template #default="{ row }">
            <el-input-number 
              v-if="editingPlan?.id === row.id" 
              v-model="editingPlan.duration_days" 
              size="small"
              :min="1"
              style="width: 100px;"
            />
            <span v-else>{{ row.duration_days }} 天</span>
          </template>
        </el-table-column>

        <el-table-column label="功能" min-width="180">
          <template #default="{ row }">
            <el-input 
              v-if="editingPlan?.id === row.id" 
              v-model="editingPlan.features" 
              size="small"
            />
            <span v-else style="font-size: 0.85rem;">{{ row.features }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <template v-if="editingPlan?.id === row.id">
              <el-button type="primary" size="small" @click="savePlan(row)">保存</el-button>
              <el-button size="small" @click="editingPlan = null">取消</el-button>
            </template>
            <template v-else>
              <el-button size="small" @click="startEdit(row)">编辑</el-button>
              <el-button 
                size="small" 
                :type="row.status === 'active' ? 'danger' : 'success'"
                @click="togglePlanStatus(row)"
              >
                {{ row.status === 'active' ? '禁用' : '启用' }}
              </el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>工具配置</span>
          <el-button type="primary" size="small" @click="addTool">+ 添加工具</el-button>
        </div>
      </template>

      <el-table v-if="tools.length" :data="tools" style="width: 100%">
        <el-table-column label="工具名称" min-width="140">
          <template #default="{ row, $index }">
            <el-input 
              v-if="editingToolIndex === $index" 
              v-model="row.name" 
              size="small"
            />
            <span v-else>{{ row.name }}</span>
          </template>
        </el-table-column>

        <el-table-column label="模块" width="140">
          <template #default="{ row, $index }">
            <el-input 
              v-if="editingToolIndex === $index" 
              v-model="row.module" 
              size="small"
              style="width: 120px;"
            />
            <span v-else style="font-size: 0.85rem;">{{ row.module }}</span>
          </template>
        </el-table-column>

        <el-table-column label="目标网址" min-width="200">
          <template #default="{ row, $index }">
            <el-input 
              v-if="editingToolIndex === $index" 
              v-model="row.target_url" 
              size="small"
              placeholder="https://example.com"
            />
            <span v-else style="font-size: 0.85rem; color: var(--studio-accent);">
              {{ row.target_url || '未配置' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="开放套餐" min-width="160">
          <template #default="{ row }">
            <span style="font-size: 0.8rem;">{{ row.available_plans?.join(', ') || '全部' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'online' ? 'success' : 'danger'" size="small">
              {{ row.status === 'online' ? '在线' : '维护' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row, $index }">
            <template v-if="editingToolIndex === $index">
              <el-button type="primary" size="small" @click="saveTool($index)">保存</el-button>
              <el-button size="small" @click="editingToolIndex = -1">取消</el-button>
            </template>
            <template v-else>
              <el-button size="small" @click="editingToolIndex = $index">编辑</el-button>
              <el-button size="small" type="danger" @click="removeTool($index)">删除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="暂无工具配置" />
    </el-card>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <div class="card-header">
          <div>
            <span>自动化版本发布</span>
            <small class="header-hint">Ed25519 签名 · 稳定哈希灰度 · 一键回滚</small>
          </div>
          <el-button type="primary" size="small" @click="showReleaseModal = true">+ 创建签名版本</el-button>
        </div>
      </template>

      <el-table v-if="toolReleases.length" :data="toolReleases" style="width: 100%">
        <el-table-column prop="tool_id" label="工具" min-width="150" />
        <el-table-column prop="version" label="版本" width="90" />
        <el-table-column prop="script_key" label="脚本" min-width="180" />
        <el-table-column label="发布状态" width="130">
          <template #default="{ row }">
            <el-tag :type="row.status === 'published' ? 'success' : row.status === 'retired' ? 'info' : 'warning'" size="small">
              {{ row.channel || 'draft' }} · {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="灰度" width="90">
          <template #default="{ row }">{{ row.rollout_percentage || 0 }}%</template>
        </el-table-column>
        <el-table-column prop="signing_key_id" label="签名密钥" width="140" />
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="publishRelease(row, 'canary')">灰度</el-button>
            <el-button size="small" type="success" @click="publishRelease(row, 'stable')">全量</el-button>
            <el-button size="small" type="warning" @click="rollbackRelease(row)">回滚到此版</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="尚未创建签名工具版本" />
    </el-card>

    <!-- 新增套餐弹窗 -->
    <el-dialog v-model="showAddPlan" title="新增套餐" width="500px">
      <el-form label-width="80px">
        <el-form-item label="套餐名称">
          <el-input v-model="newPlan.name" placeholder="请输入套餐名称" />
        </el-form-item>
        <el-form-item label="价格">
          <el-input-number v-model="newPlan.price" :min="0" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="有效期">
          <el-input-number v-model="newPlan.duration_days" :min="1" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="功能描述">
          <el-input v-model="newPlan.features" type="textarea" :rows="3" placeholder="请输入功能描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddPlan = false">取消</el-button>
        <el-button type="primary" @click="addPlan">确认添加</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showReleaseModal" title="创建签名工具版本" width="560px">
      <el-form label-width="100px">
        <el-form-item label="工具">
          <el-select v-model="newRelease.tool_id" style="width: 100%;" @change="syncReleaseScriptKey">
            <el-option v-for="tool in tools" :key="tool.id" :label="tool.name" :value="tool.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="版本">
          <el-input v-model="newRelease.version" placeholder="例如 1.1.0" />
        </el-form-item>
        <el-form-item label="脚本 Key">
          <el-input v-model="newRelease.script_key" placeholder="amazon.register.v1" />
        </el-form-item>
        <el-form-item label="产物 SHA256">
          <el-input v-model="newRelease.artifact_sha256" placeholder="内嵌脚本填写 embedded" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showReleaseModal = false">取消</el-button>
        <el-button type="primary" :loading="releaseSaving" @click="saveRelease">签名并创建</el-button>
      </template>
    </el-dialog>

    <!-- 分润比例编辑弹窗 -->
    <el-dialog v-model="showProfitModal" title="编辑分润比例" width="500px">
      <div class="profit-info">
        当前总和: {{ profitTotal }}% {{ profitTotal !== 100 ? '(应为100%)' : '✓' }}
      </div>
      
      <el-form label-width="60px">
        <el-form-item label="技术">
          <el-input-number v-model="profitRatios.tech" :min="0" :max="100" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="市场">
          <el-input-number v-model="profitRatios.market" :min="0" :max="100" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="产品">
          <el-input-number v-model="profitRatios.product" :min="0" :max="100" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="客服">
          <el-input-number v-model="profitRatios.service" :min="0" :max="100" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="统筹">
          <el-input-number v-model="profitRatios.coordination" :min="0" :max="100" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="记录">
          <el-input-number v-model="profitRatios.record" :min="0" :max="100" style="width: 100%;" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showProfitModal = false">取消</el-button>
        <el-button type="primary" @click="saveProfitRatios" :disabled="profitTotal !== 100">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getPlans, getSettings, updateSetting, getTools, updateTools, getToolReleases, createToolRelease, publishToolRelease, rollbackToolRelease } from '@/utils/api'
import { showToast } from '@/utils'

const plans = ref([])
const settings = ref([])
const tools = ref([])
const toolReleases = ref([])
const editingPlan = ref(null)
const editingToolIndex = ref(-1)
const showAddPlan = ref(false)
const showReleaseModal = ref(false)
const releaseSaving = ref(false)
const newRelease = ref({ tool_id: '', version: '1.0.0', script_key: '', artifact_sha256: 'embedded' })

const adminPassword = ref('')
const wechatId = ref('')

const newPlan = ref({ name: '', price: 0, duration_days: 7, features: '' })

// 分润比例
const showProfitModal = ref(false)
const profitRatios = ref({
  tech: 30,
  market: 25,
  product: 15,
  service: 15,
  coordination: 10,
  record: 5
})

const profitTotal = computed(() => {
  return profitRatios.value.tech + profitRatios.value.market + profitRatios.value.product +
    profitRatios.value.service + profitRatios.value.coordination + profitRatios.value.record
})

const profitRatiosText = computed(() => {
  const r = profitRatios.value
  return `技术${r.tech}% / 市场${r.market}% / 产品${r.product}% / 客服${r.service}% / 统筹${r.coordination}% / 记录${r.record}%`
})

async function loadData() {
  try {
    const [plansRes, settingsRes, toolsRes, releasesRes] = await Promise.all([
      getPlans(), getSettings(), getTools(), getToolReleases()
    ])
    plans.value = (plansRes || []).filter(p => p !== null)
    settings.value = (settingsRes || []).filter(s => s !== null)
    tools.value = (toolsRes || []).filter(t => t !== null)
    toolReleases.value = (releasesRes || []).filter(r => r !== null)

    const pwdSetting = settingsRes.find(s => s.key === 'admin_password')
    const wxSetting = settingsRes.find(s => s.key === 'wechat_id')
    const profitSetting = settingsRes.find(s => s.key === 'profit_ratios')
    if (wxSetting) wechatId.value = wxSetting.value
    if (profitSetting && profitSetting.value) {
      try {
        const ratios = JSON.parse(profitSetting.value)
        profitRatios.value = { ...profitRatios.value, ...ratios }
      } catch (e) {
        // 使用默认值
      }
    }
  } catch (err) {
    showToast('数据加载失败', 'error')
  }
}

async function savePassword() {
  if (!adminPassword.value.trim()) {
    showToast('请输入密码', 'error')
    return
  }
  try {
    await updateSetting({ 
      key: 'admin_password', 
      value: adminPassword.value.trim(), 
      description: '管理员密码' 
    })
    showToast('密码已更新', 'success')
    adminPassword.value = ''
  } catch (err) {
    showToast('更新失败', 'error')
  }
}

async function saveWechat() {
  try {
    await updateSetting({ 
      key: 'wechat_id', 
      value: wechatId.value, 
      description: '客服微信号' 
    })
    showToast('已保存', 'success')
  } catch (err) {
    showToast('保存失败', 'error')
  }
}

function startEdit(plan) {
  editingPlan.value = { ...plan }
}

async function savePlan(plan) {
  try {
    const { id, name, price, duration_days, features, status } = editingPlan.value
    const { api } = await import('@/utils/api')
    await api.put(`/api/plans/${id}`, { name, price, duration_days, features, status })
    showToast('套餐已更新', 'success')
    editingPlan.value = null
    await loadData()
  } catch (err) {
    showToast('更新失败', 'error')
  }
}

async function togglePlanStatus(plan) {
  const newStatus = plan.status === 'active' ? 'disabled' : 'active'
  try {
    const { api } = await import('@/utils/api')
    await api.put(`/api/plans/${plan.id}`, { status: newStatus })
    showToast(newStatus === 'active' ? '已启用' : '已禁用', 'success')
    await loadData()
  } catch (err) {
    showToast('操作失败', 'error')
  }
}

async function addPlan() {
  if (!newPlan.value.name) {
    showToast('请输入套餐名称', 'error')
    return
  }
  try {
    const { api } = await import('@/utils/api')
    await api.post('/api/plans', newPlan.value)
    showToast('套餐已添加', 'success')
    showAddPlan.value = false
    newPlan.value = { name: '', price: 0, duration_days: 7, features: '' }
    await loadData()
  } catch (err) {
    showToast('添加失败', 'error')
  }
}

function addTool() {
  tools.value.push({ 
    name: '新工具', 
    module: '未分类', 
    target_url: '',
    available_plans: [], 
    status: 'online' 
  })
  editingToolIndex.value = tools.value.length - 1
}

function saveTool(index) {
  updateTools(tools.value)
    .then(() => {
      showToast('工具配置已保存', 'success')
      editingToolIndex.value = -1
    })
    .catch(() => showToast('保存失败', 'error'))
}

function removeTool(index) {
  if (!confirm('确定删除此工具配置吗？')) return
  tools.value.splice(index, 1)
  updateTools(tools.value)
    .then(() => showToast('已删除', 'success'))
    .catch(() => showToast('删除失败', 'error'))
}

function syncReleaseScriptKey(toolId) {
  const tool = tools.value.find(item => item.id === toolId)
  if (tool) newRelease.value.script_key = tool.script_key || `${tool.platform_key}.${tool.capability_key}.v1`
}

async function saveRelease() {
  if (!newRelease.value.tool_id || !newRelease.value.version || !newRelease.value.script_key) {
    showToast('请完整填写工具、版本和脚本 Key', 'error')
    return
  }
  releaseSaving.value = true
  try {
    await createToolRelease(newRelease.value)
    showToast('签名版本已创建', 'success')
    showReleaseModal.value = false
    newRelease.value = { tool_id: '', version: '1.0.0', script_key: '', artifact_sha256: 'embedded' }
    await loadData()
  } catch (error) {
    showToast(error?.message || '创建版本失败', 'error')
  } finally {
    releaseSaving.value = false
  }
}

async function publishRelease(release, channel) {
  let rollout = 100
  if (channel === 'canary') {
    const input = window.prompt('请输入灰度比例（1-99）', String(release.rollout_percentage || 10))
    if (input === null) return
    rollout = Number(input)
    if (!Number.isInteger(rollout) || rollout < 1 || rollout > 99) {
      showToast('灰度比例必须是 1-99 的整数', 'error')
      return
    }
  }
  try {
    await publishToolRelease(release.tool_id, release.version, { channel, rollout_percentage: rollout })
    showToast(channel === 'stable' ? '已全量发布' : `已灰度发布 ${rollout}%`, 'success')
    await loadData()
  } catch (error) {
    showToast(error?.message || '发布失败', 'error')
  }
}

async function rollbackRelease(release) {
  if (!window.confirm(`确定将 ${release.tool_id} 回滚到 ${release.version} 吗？`)) return
  try {
    await rollbackToolRelease(release.tool_id, release.version)
    showToast(`已回滚到 ${release.version}`, 'success')
    await loadData()
  } catch (error) {
    showToast(error?.message || '回滚失败', 'error')
  }
}

function openProfitEdit() {
  showProfitModal.value = true
}

async function saveProfitRatios() {
  if (profitTotal.value !== 100) {
    showToast('分润比例总和必须为100%', 'error')
    return
  }
  try {
    await updateSetting({
      key: 'profit_ratios',
      value: JSON.stringify(profitRatios.value),
      description: '分润比例配置'
    })
    showToast('分润比例已更新', 'success')
    showProfitModal.value = false
  } catch (err) {
    showToast('保存失败', 'error')
  }
}

onMounted(loadData)
</script>

<style scoped>
.page-title {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--studio-text-main);
  margin-bottom: 1.5rem;
}

.settings-card {
  margin-bottom: 1.5rem;
  background: var(--studio-surface);
  border-radius: var(--radius-lg);
}

.settings-card :deep(.el-card__header) {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
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

.header-hint {
  display: block;
  margin-top: 3px;
  color: var(--studio-text-muted);
  font-size: 0.72rem;
  font-weight: 400;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  border-bottom: 1px solid var(--color-border);
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-info {
  flex: 1;
}

.setting-title {
  font-weight: 600;
  color: var(--studio-text-main);
  margin-bottom: 0.25rem;
}

.setting-desc {
  font-size: 0.85rem;
  color: var(--studio-text-muted);
  margin-top: 0.25rem;
}

.setting-control {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.profit-info {
  font-size: 0.85rem;
  color: var(--studio-text-muted);
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--studio-bg);
  border-radius: var(--radius-sm);
}

:deep(.el-form-item) {
  margin-bottom: 0;
  padding: 1rem 0;
  border-bottom: 1px solid var(--color-border);
}

:deep(.el-form-item:last-child) {
  border-bottom: none;
}

:deep(.el-table) {
  --el-table-border-color: var(--color-border);
  --el-table-header-bg-color: var(--studio-bg);
  --el-table-row-hover-bg-color: var(--studio-bg-hover);
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
