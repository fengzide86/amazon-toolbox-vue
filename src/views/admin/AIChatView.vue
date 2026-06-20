<template>
  <div class="ai-chat-admin">
    <div class="page-header">
      <h2 class="page-title">AI 客服管理</h2>
    </div>

    <el-tabs v-model="activeTab" class="studio-tabs">
      <el-tab-pane label="基础配置" name="config">
        <div class="tab-content">
          <div class="config-section">
            <h3>欢迎语</h3>
            <el-input
              v-model="config.welcome_message"
              type="textarea"
              :rows="3"
              placeholder="用户进入 AI 客服时显示的欢迎语"
            />
          </div>

          <div class="config-section">
            <h3>推荐问题</h3>
            <p class="hint">用户进入时显示的推荐问题（最多 5 个）</p>
            <div v-for="(q, i) in suggestedQuestions" :key="i" class="suggested-item">
              <el-input v-model="suggestedQuestions[i]" :placeholder="`推荐问题 ${i + 1}`" />
              <el-button
                v-if="suggestedQuestions.length > 1"
                type="danger"
                size="small"
                @click="suggestedQuestions.splice(i, 1)"
              >
                删除
              </el-button>
            </div>
            <el-button v-if="suggestedQuestions.length < 5" @click="suggestedQuestions.push('')">
              + 添加
            </el-button>
          </div>

          <div class="config-section">
            <h3>转人工规则</h3>
            <el-checkbox v-model="transferRules.refund_direct_transfer" class="checkbox-item">
              退款相关问题直接转人工
            </el-checkbox>
            <el-checkbox v-model="transferRules.complaint_direct_transfer" class="checkbox-item">
              投诉/情绪问题直接转人工
            </el-checkbox>
            <el-checkbox v-model="transferRules.auto_transfer_after_retries" class="checkbox-item">
              AI 连续 3 次未解决自动转人工
            </el-checkbox>
            <el-checkbox v-model="transferRules.account_direct_transfer" class="checkbox-item">
              账号/授权问题直接转人工
            </el-checkbox>
          </div>

          <el-button type="primary" @click="saveConfig" :loading="saving">
            {{ saving ? '保存中...' : '保存配置' }}
          </el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="对话记录" name="sessions">
        <div class="tab-content">
          <div class="filter-bar">
            <el-select v-model="sessionFilter" placeholder="全部状态" clearable @change="loadSessions" style="width: 160px;">
              <el-option label="全部状态" value="" />
              <el-option label="进行中" value="active" />
              <el-option label="已解决" value="resolved" />
              <el-option label="已转人工" value="transferred" />
            </el-select>
          </div>

          <div class="sessions-list">
            <el-card
              v-for="session in sessions"
              :key="session.session_id"
              class="session-card"
              shadow="hover"
              @click="viewSession(session)"
            >
              <div class="session-header">
                <span class="session-id">{{ session.session_id }}</span>
                <el-tag :type="getStatusTagType(session.status)" size="small">
                  {{ getStatusText(session.status) }}
                </el-tag>
              </div>
              <div class="session-info">
                <span>用户: {{ session.user_name || '匿名' }}</span>
                <span>消息: {{ session.message_count }}</span>
                <span>{{ formatTime(session.created_at) }}</span>
              </div>
              <div class="session-meta">
                <el-tag v-if="session.ai_resolved" type="success" size="small">AI 已解决</el-tag>
                <el-tag v-if="session.transferred_to_human" type="warning" size="small">已转人工</el-tag>
                <el-tag v-if="session.satisfaction" type="info" size="small">评分: {{ session.satisfaction }}★</el-tag>
              </div>
            </el-card>
            <el-empty v-if="!sessions.length" description="暂无对话记录" />
          </div>

          <div v-if="totalSessions > pageSize" class="pagination">
            <el-pagination
              v-model:current-page="currentPage"
              :page-size="pageSize"
              :total="totalSessions"
              layout="prev, pager, next"
              @current-change="loadSessions"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="数据看板" name="stats">
        <div class="tab-content">
          <el-row :gutter="16" class="stats-grid">
            <el-col :span="6">
              <el-card class="stat-card" shadow="never">
                <div class="stat-value">{{ stats.total_sessions || 0 }}</div>
                <div class="stat-label">总对话数</div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card class="stat-card" shadow="never">
                <div class="stat-value">{{ stats.today_sessions || 0 }}</div>
                <div class="stat-label">今日对话</div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card class="stat-card" shadow="never">
                <div class="stat-value">{{ stats.resolve_rate || 0 }}%</div>
                <div class="stat-label">AI 解决率</div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card class="stat-card" shadow="never">
                <div class="stat-value">{{ stats.transfer_rate || 0 }}%</div>
                <div class="stat-label">转人工率</div>
              </el-card>
            </el-col>
          </el-row>
          <el-row :gutter="16" style="margin-top: 1rem;">
            <el-col :span="6">
              <el-card class="stat-card" shadow="never">
                <div class="stat-value">{{ stats.avg_satisfaction || '-' }}</div>
                <div class="stat-label">平均满意度</div>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 会话详情弹窗 -->
    <el-dialog v-model="showDetail" title="对话详情" width="800px" :close-on-click-modal="true">
      <div class="session-detail-header">
        <span>会话 ID: {{ currentSession?.session_id }}</span>
        <span>用户: {{ currentSession?.user_name || '匿名' }}</span>
        <el-tag :type="getStatusTagType(currentSession?.status)" size="small">
          {{ getStatusText(currentSession?.status) }}
        </el-tag>
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
    </el-dialog>
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

function getStatusTagType(status) {
  const map = { active: '', resolved: 'success', transferred: 'warning' }
  return map[status] || 'info'
}

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
  padding: 0;
}

.page-header {
  margin-bottom: 1.5rem;
}

.page-title {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--studio-text-main);
  margin: 0;
}

.studio-tabs {
  background: var(--studio-surface);
  border-radius: var(--radius-lg);
  padding: 1rem;
}

.tab-content {
  padding: 1rem 0;
}

/* 配置 */
.config-section {
  margin-bottom: 1.5rem;
}

.config-section h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--studio-text-main);
}

.config-section .hint {
  margin: 0 0 0.5rem 0;
  font-size: 0.85rem;
  color: var(--studio-text-muted);
}

.suggested-item {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  align-items: center;
}

.checkbox-item {
  display: flex;
  margin-bottom: 0.5rem;
}

/* 对话记录 */
.filter-bar {
  margin-bottom: 1rem;
}

.sessions-list {
  display: grid;
  gap: 0.75rem;
}

.session-card {
  cursor: pointer;
  transition: all 0.2s;
}

.session-card:hover {
  border-color: var(--studio-accent);
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
  color: var(--studio-text-muted);
}

.session-info {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: var(--studio-text-muted);
  margin-bottom: 0.5rem;
}

.session-meta {
  display: flex;
  gap: 0.5rem;
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: 1.5rem;
}

/* 统计 */
.stats-grid {
  margin-bottom: 1rem;
}

.stat-card {
  background: var(--studio-bg);
  border-radius: var(--radius-lg);
  text-align: center;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--studio-text-main);
}

.stat-label {
  font-size: 0.85rem;
  color: var(--studio-text-muted);
  margin-top: 0.25rem;
}

/* 弹窗 */
.session-detail-header {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--studio-border);
  font-size: 0.85rem;
  align-items: center;
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
  background: var(--studio-bg);
}

.message.user .message-content {
  background: var(--studio-accent);
  color: white;
}

.message-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.message-time {
  font-size: 0.7rem;
  color: var(--studio-text-muted);
  margin-top: 0.25rem;
  text-align: right;
}

.message.user .message-time {
  color: rgba(255, 255, 255, 0.7);
}

:deep(.el-tabs__header) {
  margin-bottom: 0;
}

:deep(.el-tabs__nav-wrap::after) {
  display: none;
}

:deep(.el-dialog) {
  border-radius: var(--radius-lg);
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid var(--studio-border);
  padding-bottom: 1rem;
}
</style>