<template>
  <div>
    <h2 class="page-title">系统设置</h2>

    <section class="table-card" style="margin-bottom: 1.5rem;">
      <div class="table-header">
        <h3>基本设置</h3>
      </div>
      <div style="padding: 1rem 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--color-border);">
          <div>
            <div style="font-weight: 600; color: var(--color-primary);">管理员密码</div>
            <div style="font-size: 0.85rem; color: var(--color-muted); margin-top: 0.25rem;">用于管理后台登录</div>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <input type="password" v-model="adminPassword" class="form-input" placeholder="新密码" style="width: 200px;">
            <button class="btn btn-primary" style="padding: 0.5rem 1rem;" @click="savePassword">更新密码</button>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--color-border);">
          <div>
            <div style="font-weight: 600; color: var(--color-primary);">客服微信</div>
            <div style="font-size: 0.85rem; color: var(--color-muted); margin-top: 0.25rem;">显示在登录页和帮助页面</div>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <input type="text" v-model="wechatId" class="form-input" placeholder="客服微信号" style="width: 250px;">
            <button class="btn btn-primary" style="padding: 0.5rem 1rem;" @click="saveWechat">保存</button>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--color-border);">
          <div>
            <div style="font-weight: 600; color: var(--color-primary);">分润比例</div>
            <div style="font-size: 0.85rem; color: var(--color-muted); margin-top: 0.25rem;">{{ profitRatiosText }}</div>
          </div>
          <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" @click="openProfitEdit">编辑</button>
        </div>
      </div>
    </section>

    <section class="table-card" style="margin-bottom: 1.5rem;">
      <div class="table-header">
        <h3>套餐管理</h3>
        <button class="btn btn-primary" style="padding: 0.4rem 1rem; font-size: 0.85rem;" @click="showAddPlan = true">+ 新增套餐</button>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">套餐名称</th>
            <th scope="col">价格</th>
            <th scope="col">有效期</th>
            <th scope="col">功能</th>
            <th scope="col">状态</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="plan in plans" :key="plan.id">
            <td>
              <input v-if="editingPlan?.id === plan.id" v-model="editingPlan.name" class="btn btn-secondary" style="padding:0.3rem 0.6rem;font-size:0.85rem;">
              <span v-else>{{ plan.name }}</span>
            </td>
            <td>
              <input v-if="editingPlan?.id === plan.id" v-model.number="editingPlan.price" type="number" class="btn btn-secondary" style="padding:0.3rem 0.6rem;font-size:0.85rem;width:80px;">
              <span v-else>¥{{ plan.price }}</span>
            </td>
            <td>
              <input v-if="editingPlan?.id === plan.id" v-model.number="editingPlan.duration_days" type="number" class="btn btn-secondary" style="padding:0.3rem 0.6rem;font-size:0.85rem;width:70px;">
              <span v-else>{{ plan.duration_days }} 天</span>
            </td>
            <td>
              <input v-if="editingPlan?.id === plan.id" v-model="editingPlan.features" class="btn btn-secondary" style="padding:0.3rem 0.6rem;font-size:0.85rem;width:150px;">
              <span v-else style="font-size:0.85rem;">{{ plan.features }}</span>
            </td>
            <td><span :class="['status-dot', plan.status === 'active' ? 'success' : 'error']"></span>{{ plan.status === 'active' ? '启用' : '禁用' }}</td>
            <td>
              <template v-if="editingPlan?.id === plan.id">
                <button class="btn btn-primary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; margin-right: 0.3rem;" @click="savePlan(plan)">保存</button>
                <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" @click="editingPlan = null">取消</button>
              </template>
              <template v-else>
                <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; margin-right: 0.3rem;" @click="startEdit(plan)">编辑</button>
                <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; color: var(--color-destructive);" @click="togglePlanStatus(plan)">
                  {{ plan.status === 'active' ? '禁用' : '启用' }}
                </button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="table-card" style="margin-bottom: 1.5rem;">
      <div class="table-header">
        <h3>工具配置</h3>
        <button class="btn btn-primary" style="padding: 0.4rem 1rem; font-size: 0.85rem;" @click="addTool">+ 添加工具</button>
      </div>
      <table class="data-table" v-if="tools.length">
        <thead>
          <tr>
            <th scope="col">工具名称</th>
            <th scope="col">模块</th>
            <th scope="col">开放套餐</th>
            <th scope="col">状态</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(tool, index) in tools" :key="index">
            <td>
              <input v-if="editingToolIndex === index" v-model="tool.name" class="btn btn-secondary" style="padding:0.3rem 0.6rem;font-size:0.85rem;">
              <span v-else>{{ tool.name }}</span>
            </td>
            <td>
              <input v-if="editingToolIndex === index" v-model="tool.module" class="btn btn-secondary" style="padding:0.3rem 0.6rem;font-size:0.85rem;width:100px;">
              <span v-else style="font-size:0.85rem;">{{ tool.module }}</span>
            </td>
            <td style="font-size:0.8rem;">{{ tool.available_plans?.join(', ') || '全部' }}</td>
            <td><span :class="['status-dot', tool.status === 'online' ? 'success' : 'error']"></span>{{ tool.status === 'online' ? '在线' : '维护' }}</td>
            <td>
              <template v-if="editingToolIndex === index">
                <button class="btn btn-primary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; margin-right: 0.3rem;" @click="saveTool(index)">保存</button>
                <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" @click="editingToolIndex = -1">取消</button>
              </template>
              <template v-else>
                <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; margin-right: 0.3rem;" @click="editingToolIndex = index">编辑</button>
                <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; color: var(--color-destructive);" @click="removeTool(index)">删除</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else style="padding:2rem;text-align:center;color:var(--color-muted);">暂无工具配置</div>
    </section>

    <!-- 新增套餐弹窗 -->
    <div class="modal-overlay" :class="{ show: showAddPlan }" @click.self="showAddPlan = false">
      <div class="modal">
        <h3>新增套餐</h3>
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
          <input v-model="newPlan.name" placeholder="套餐名称" class="btn btn-secondary" style="padding:0.6rem 1rem;text-align:left;">
          <input v-model.number="newPlan.price" type="number" placeholder="价格" class="btn btn-secondary" style="padding:0.6rem 1rem;text-align:left;">
          <input v-model.number="newPlan.duration_days" type="number" placeholder="有效期天数" class="btn btn-secondary" style="padding:0.6rem 1rem;text-align:left;">
          <input v-model="newPlan.features" placeholder="功能描述" class="btn btn-secondary" style="padding:0.6rem 1rem;text-align:left;">
        </div>
        <div class="modal-btns" style="margin-top:1rem;">
          <button class="btn btn-primary" @click="addPlan">确认添加</button>
          <button class="btn btn-secondary" @click="showAddPlan = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 分润比例编辑弹窗 -->
    <div class="modal-overlay" :class="{ show: showProfitModal }" @click.self="showProfitModal = false">
      <div class="modal">
        <h3>编辑分润比例</h3>
        <p style="font-size: 0.85rem; color: var(--color-muted); margin-bottom: 1rem;">
          当前总和: {{ profitTotal }}% {{ profitTotal !== 100 ? '(应为100%)' : '✓' }}
        </p>
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <label style="min-width:60px;font-size:0.85rem;">技术:</label>
            <input v-model.number="profitRatios.tech" type="number" min="0" max="100" class="btn btn-secondary" style="flex:1;padding:0.5rem;text-align:left;">
            <span style="font-size:0.85rem;">%</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <label style="min-width:60px;font-size:0.85rem;">市场:</label>
            <input v-model.number="profitRatios.market" type="number" min="0" max="100" class="btn btn-secondary" style="flex:1;padding:0.5rem;text-align:left;">
            <span style="font-size:0.85rem;">%</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <label style="min-width:60px;font-size:0.85rem;">产品:</label>
            <input v-model.number="profitRatios.product" type="number" min="0" max="100" class="btn btn-secondary" style="flex:1;padding:0.5rem;text-align:left;">
            <span style="font-size:0.85rem;">%</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <label style="min-width:60px;font-size:0.85rem;">客服:</label>
            <input v-model.number="profitRatios.service" type="number" min="0" max="100" class="btn btn-secondary" style="flex:1;padding:0.5rem;text-align:left;">
            <span style="font-size:0.85rem;">%</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <label style="min-width:60px;font-size:0.85rem;">统筹:</label>
            <input v-model.number="profitRatios.coordination" type="number" min="0" max="100" class="btn btn-secondary" style="flex:1;padding:0.5rem;text-align:left;">
            <span style="font-size:0.85rem;">%</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <label style="min-width:60px;font-size:0.85rem;">记录:</label>
            <input v-model.number="profitRatios.record" type="number" min="0" max="100" class="btn btn-secondary" style="flex:1;padding:0.5rem;text-align:left;">
            <span style="font-size:0.85rem;">%</span>
          </div>
        </div>
        <div class="modal-btns" style="margin-top:1rem;">
          <button class="btn btn-primary" @click="saveProfitRatios" :disabled="profitTotal !== 100">保存</button>
          <button class="btn btn-secondary" @click="showProfitModal = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getPlans, getSettings, updateSetting, getTools, updateTools } from '@/utils/api'
import { showToast } from '@/utils'

const plans = ref([])
const settings = ref([])
const tools = ref([])
const editingPlan = ref(null)
const editingToolIndex = ref(-1)
const showAddPlan = ref(false)

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
    const [plansRes, settingsRes, toolsRes] = await Promise.all([
      getPlans(), getSettings(), getTools()
    ])
    plans.value = (plansRes || []).filter(p => p !== null)
    settings.value = (settingsRes || []).filter(s => s !== null)
    tools.value = (toolsRes || []).filter(t => t !== null)

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
  if (!adminPassword.value.trim()) { showToast('请输入密码', 'error'); return }
  try {
    await updateSetting({ key: 'admin_password', value: adminPassword.value.trim(), description: '管理员密码' })
    showToast('密码已更新', 'success')
    adminPassword.value = ''
  } catch (err) { showToast('更新失败', 'error') }
}

async function saveWechat() {
  try {
    await updateSetting({ key: 'wechat_id', value: wechatId.value, description: '客服微信号' })
    showToast('已保存', 'success')
  } catch (err) { showToast('保存失败', 'error') }
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
  } catch (err) { showToast('更新失败', 'error') }
}

async function togglePlanStatus(plan) {
  const newStatus = plan.status === 'active' ? 'disabled' : 'active'
  try {
    const { api } = await import('@/utils/api')
    await api.put(`/api/plans/${plan.id}`, { status: newStatus })
    showToast(newStatus === 'active' ? '已启用' : '已禁用', 'success')
    await loadData()
  } catch (err) { showToast('操作失败', 'error') }
}

async function addPlan() {
  if (!newPlan.value.name) { showToast('请输入套餐名称', 'error'); return }
  try {
    const { api } = await import('@/utils/api')
    await api.post('/api/plans', newPlan.value)
    showToast('套餐已添加', 'success')
    showAddPlan.value = false
    newPlan.value = { name: '', price: 0, duration_days: 7, features: '' }
    await loadData()
  } catch (err) { showToast('添加失败', 'error') }
}

function addTool() {
  tools.value.push({ name: '新工具', module: '未分类', available_plans: [], status: 'online' })
  editingToolIndex.value = tools.value.length - 1
}

function saveTool(index) {
  updateTools(tools.value)
    .then(() => { showToast('工具配置已保存', 'success'); editingToolIndex.value = -1 })
    .catch(() => showToast('保存失败', 'error'))
}

function removeTool(index) {
  if (!confirm('确定删除此工具配置吗？')) return
  tools.value.splice(index, 1)
  updateTools(tools.value)
    .then(() => showToast('已删除', 'success'))
    .catch(() => showToast('删除失败', 'error'))
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
.modal-overlay {
  display: none; position: fixed; inset: 0; background: rgba(15,23,42,0.5);
  backdrop-filter: blur(5px); z-index: 1000; align-items: center; justify-content: center;
}
.modal-overlay.show { display: flex; }
.modal {
  background: white; border-radius: 20px; padding: 2rem; max-width: 400px; width: 90%;
  box-shadow: 0 25px 50px rgba(0,0,0,0.15);
}
.modal h3 { font-family: var(--font-heading); font-size: 1.1rem; margin-bottom: 1rem; color: var(--color-primary); }
.modal-btns { display: flex; gap: 0.75rem; }
.modal-btns button { flex: 1; padding: 0.75rem; border-radius: 10px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
</style>