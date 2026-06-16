<template>
  <div class="ai-chat-admin">
    <div class="page-header">
      <h2 class="page-title">AI 客服管理</h2>
    </div>

    <div class="tabs">
      <button :class="['tab', activeTab === 'config' && 'active']" @click="activeTab = 'config'">基础配置</button>
      <button :class="['tab', activeTab === 'sessions' && 'active']" @click="activeTab = 'sessions'">对话记录</button>
      <button :class="['tab', activeTab === 'stats' && 'active']" @click="activeTab = 'stats'">数据看板</button>
    </div>

    <!-- 基础配置 -->
    <div v-if="activeTab === 'config'" class="tab-content">
      <div class="config-section">
        <h3>欢迎语</h3>
        <textarea v-model="config.welcome_message" rows="3" placeholder="用户进入 AI 客服时显示的欢迎语"></textarea>
      </div>

      <div class="config-section">
        <h3>推荐问题</h3>
        <p class="hint">用户进入时显示的推荐问题（最多 5 个）</p>
        <div v-for="(q, i) in suggestedQuestions" :key="i" class="suggested-item">
          <input v-model="suggestedQuestions[i]" :placeholder="`推荐问题 ${i + 1}`" />
          <button v-if="suggestedQuestions.length > 1" class="btn-icon" @click="suggestedQuestions.splice(i, 1)">×</button>
        </div>
        <button v-if="suggestedQuestions.length < 5" class="btn btn-secondary" @click="suggestedQuestions.push('')">+ 添加</button>
      </div>

      <div class="config-section">
        <h3>转人工规则</h3>
        <label class="checkbox-item">
          <input type="checkbox" v-model="transferRules.refund_direct_transfer" />
          退款相关问题直接转人工
        </label>
        <label class="checkbox-item">
          <input type="checkbox" v-model="transferRules.complaint_direct_transfer" />
          投诉/情绪问题直接转人工
        </label>
        <label class="checkbox-item">
          <input type="checkbox" v-model="transferRules.auto_transfer_after_retries" />
          AI 连续 3 次未解决自动转人工
        </label>
        <label class="checkbox-item">
          <input type="checkbox" v-model="transferRules.account_direct_transfer" />
          账号/授权问题直接转人工
        </label>
      </div>

      <button class="btn btn-primary" @click="saveConfig" :disabled="saving">
        {{ saving ? '保存中...' : '保存配置' }}
      </button>
    </div>

    <!-- 对话记录 -->
    <div v-if="activeTab === 'sessions'" class="tab-content">
      <div class="filter-bar">
        <select v-model="sessionFilter" @change="loadSessions">
          <option value="">全部状态</option>
          <option value="active">进行中</option>
          <option value="resolved">已解决</option>
          <option value="transferred">已转人工</option>
        </select>
      </div>

      <div class="sessions-list">
        <div v-for="session in sessions" :key="session.session_id" class="session-card" @click="viewSession(session)">
          <div class="session-header">
            <span class="session-id">{{ session.session_id }}</span>
            <span :class="['status-badge', session.status]">{{ getStatusText(session.status) }}</span>
          </div>
          <div class="session-info">
            <span>用户: {{ session.user_name || '匿名' }}</span>
            <span>消息: {{ session.message_count }}</span>
            <span>{{ formatTime(session.created_at) }}</span>
          </div>
          <div class="session-meta">
            <span v-if="session.ai_resolved" class="meta-tag success">AI 已解决</span>
            <span v-if="session.transferred_to_human" class="meta-tag warning">已转人工</span>
            <span v-if="session.satisfaction" class="meta-tag info">评分: {{ session.satisfaction }}★</span>
          </div>
        </div>
        <div v-if="!sessions.length" class="empty-state">暂无对话记录</div>
      </div>

      <div v-if="totalSessions > pageSize" class="pagination">
        <button :disabled="currentPage <= 1" @click="currentPage--; loadSessions()">上一页</button>
        <span>{{ currentPage }} / {{ Math.ceil(totalSessions / pageSize) }}</span>
        <button :disabled="currentPage >= Math.ceil(totalSessions / pageSize)" @click="currentPage++; loadSessions()">下一页</button>
      </div>
    </div>

    <!-- 数据看板 -->
    <div v-if="activeTab === 'stats'" class="tab-content">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ stats.total_sessions || 0 }}</div>
          <div class="stat-label">总对话数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.today_sessions || 0 }}</div>
          <div class="stat-label">今日对话</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.resolve_rate || 0 }}%</div>
          <div class="stat-label">AI 解决率</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.transfer_rate || 0 }}%</div>
          <div class="stat-label">转人工率</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.avg_satisfaction || '-' }}</div>
          <div class="stat-label">平均满意度</div>
        </div>
      </div>
    </div>

    <!-- 会话详情弹窗 -->
    <div v-if="showDetail" class="modal-overlay" @click.self="showDetail = false">
      <div class="modal modal-large">
        <div class="modal-header">
          <h3>对话详情</h3>
          <button class="btn-icon" @click="showDetail = false">×</button>
        </div>
        <div class="session-detail-header">
          <span>会话 ID: {{ currentSession?.session_id }}</span>
          <span>用户: {{ currentSession?.user_name || '匿名' }}</span>
          <span :class="['status-badge', currentSession?.status]">{{ getStatusText(currentSession?.status) }}</span>
        </div>
        <div class="chat-messages">
          <div v-for="msg in currentSession?.messages || []" :key="msg.id" :class="['message', msg.role]">
            <div class="message-avatar">
              {{ msg.role === 'user' ? '👤' : msg.role === 'ai' ? '🤖' : '⚙️' }}
            </div>
            <div class="message-content">
              <div class="message-text">{{ msg.content }}</div>
              <div class="message-time">{{ formatTime(msg.created_at) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getAIChatConfig, updateAIChatConfig, getAdminChatSessions, getAdminChatSession, getAIChatStats } from '@/utils/api'
import { showToast } from '@/utils'

const activeTab = ref('config')

// 配置
const config = ref({
  welcome_message: '',
  suggested_questions: '[]',
  transfer_rules: '{}'
})
const suggestedQuestions = ref([''])
const transferRules = ref({
  refund_direct_transfer: true,
  complaint_direct_transfer: true,
  auto_transfer_after_retries: true,
  account_direct_transfer: false
})
const saving = ref(false)

// 对话记录
const sessions = ref([])
const sessionFilter = ref('')
const currentPage = ref(1)
const pageSize = 20
const totalSessions = ref(0)
const showDetail = ref(false)
const currentSession = ref(null)

// 统计
const stats = ref({})

function getStatusText(status) {
  const map = { active: '进行中', resolved: '已解决', transferred: '已转人工' }
  return map[status] || status
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const d = new Date(timeStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function loadConfig() {
  try {
    const res = await getAIChatConfig()
    config.value = res
    try {
      suggestedQuestions.value = JSON.parse(res.suggested_questions || '[]')
    } catch {
      suggestedQuestions.value = ['']
    }
    try {
      transferRules.value = JSON.parse(res.transfer_rules || '{}')
    } catch {
      transferRules.value = {
        refund_direct_transfer: true,
        complaint_direct_transfer: true,
        auto_transfer_after_retries: true,
        account_direct_transfer: false
      }
    }
  } catch (err) {
    showToast('加载配置失败', 'error')
  }
}

  async function saveConfig() {
    saving.value = true
    try {
      await updateAIChatConfig({
        welcome_message: config.value.welcome_message,
        suggested_questions: JSON.stringify(suggestedQuestions.value.filter(q => q.trim())),
        transfer_rules: JSON.stringify(transferRules.value)
      })
    showToast('配置已保存', 'success')
  } catch (err) {
    showToast('保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function loadSessions() {
  try {
    const res = await getAdminChatSessions({
      status: sessionFilter.value || undefined,
      page: currentPage.value,
      page_size: pageSize
    })
    sessions.value = res.items || []
    totalSessions.value = res.total || 0
  } catch (err) {
    showToast('加载对话记录失败', 'error')
  }
}

async function viewSession(session) {
  try {
    const res = await getAdminChatSession(session.session_id)
    currentSession.value = { ...session, messages: res.messages || [] }
    showDetail.value = true
  } catch (err) {
    showToast('加载会话详情失败', 'error')
  }
}

async function loadStats() {
  try {
    stats.value = await getAIChatStats()
  } catch (err) {
    showToast('加载统计数据失败', 'error')
  }
}

onMounted(() => {
  loadConfig()
  loadSessions()
  loadStats()
})
</script>

<style scoped>
.ai-chat-admin {
  padding: 1rem;
}

.page-header {
  margin-bottom: 1.5rem;
}

.page-header h2 {
  margin: 0;
  font-size: 1.5rem;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.tab {
  padding: 0.75rem 1.5rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.95rem;
  color: var(--color-text-secondary);
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab:hover {
  color: var(--color-primary);
}

.tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.tab-content {
  animation: fadeIn 0.2s;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 配置 */
.config-section {
  margin-bottom: 1.5rem;
}

.config-section h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
}

.config-section .hint {
  margin: 0 0 0.5rem 0;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.config-section textarea,
.config-section input[type="text"] {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.95rem;
  resize: vertical;
}

.suggested-item {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.suggested-item input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
}

.checkbox-item input {
  width: 18px;
  height: 18px;
}

/* 对话记录 */
.filter-bar {
  margin-bottom: 1rem;
}

.filter-bar select {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.sessions-list {
  display: grid;
  gap: 0.75rem;
}

.session-card {
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.session-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.session-id {
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.status-badge {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.status-badge.active { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.status-badge.resolved { background: rgba(16, 185, 129, 0.1); color: #10b981; }
.status-badge.transferred { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }

.session-info {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
}

.session-meta {
  display: flex;
  gap: 0.5rem;
}

.meta-tag {
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
}

.meta-tag.success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
.meta-tag.warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
.meta-tag.info { background: rgba(99, 102, 241, 0.1); color: #6366f1; }

.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--color-text-secondary);
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 1.5rem;
}

.pagination button {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: none;
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 统计 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.stat-card {
  padding: 1.5rem;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  text-align: center;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-primary);
}

.stat-label {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-large {
  max-width: 800px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.modal-header h3 {
  margin: 0;
}

.btn-icon {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--color-text-secondary);
  padding: 0.25rem 0.5rem;
}

.session-detail-header {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.85rem;
}

.chat-messages {
  max-height: 60vh;
  overflow-y: auto;
}

.message {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  font-size: 1.5rem;
}

.message-content {
  max-width: 70%;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: var(--color-bg-secondary);
}

.message.user .message-content {
  background: var(--color-primary);
  color: white;
}

.message-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.message-time {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
  text-align: right;
}

.message.user .message-time {
  color: rgba(255,255,255,0.7);
}
</style>