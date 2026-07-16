<template>
  <div class="ai-chat-admin">
    <div class="page-header">
      <h2 class="page-title">AI 客服管理</h2>
    </div>

    <!-- Master-Detail 双栏布局 -->
    <div class="master-detail-container">
      <!-- 左侧面板：配置 + 数据看板 + 对话记录 -->
      <div class="panel-left">
        <!-- 策略配置 -->
        <div class="panel-section">
          <h3 class="section-title">⚙️ 策略配置</h3>
          
          <div class="config-section">
            <label>欢迎语</label>
            <el-input
              v-model="config.welcome_message"
              type="textarea"
              :rows="2"
              placeholder="用户进入时显示的欢迎语"
            />
          </div>

          <div class="config-section">
            <label>推荐问题</label>
            <div v-for="(q, i) in suggestedQuestions" :key="i" class="suggested-item">
              <el-input v-model="suggestedQuestions[i]" size="small" :placeholder="`推荐问题 ${i + 1}`" />
              <el-button
                v-if="suggestedQuestions.length > 1"
                type="danger"
                size="small"
                circle
                @click="suggestedQuestions.splice(i, 1)"
              >
                ×
              </el-button>
            </div>
            <el-button v-if="suggestedQuestions.length < 5" size="small" @click="suggestedQuestions.push('')">
              + 添加
            </el-button>
          </div>

          <div class="config-row">
            <div class="config-section">
              <label>模型</label>
              <el-input v-model="config.ai_model" placeholder="如 qwen-turbo" />
            </div>
            <div class="config-section">
              <label>回复风格</label>
              <el-select v-model="config.reply_style" style="width: 100%;">
                <el-option label="简洁" value="concise" />
                <el-option label="详细" value="detailed" />
                <el-option label="友好" value="friendly" />
              </el-select>
            </div>
          </div>

          <div class="config-section">
            <label>转人工规则</label>
            <el-checkbox v-model="transferRules.refund_direct_transfer" class="checkbox-item">
              退款问题直接转人工
            </el-checkbox>
            <el-checkbox v-model="transferRules.complaint_direct_transfer" class="checkbox-item">
              投诉/情绪直接转人工
            </el-checkbox>
            <el-checkbox v-model="transferRules.auto_transfer_after_retries" class="checkbox-item">
              3次未解决自动转人工
            </el-checkbox>
          </div>

          <el-button type="primary" size="small" @click="saveConfig" :loading="saving" style="width: 100%;">
            {{ saving ? '保存中...' : '保存配置' }}
          </el-button>
        </div>

        <!-- 数据看板 -->
        <div class="panel-section">
          <h3 class="section-title">📊 数据看板</h3>
          <div class="stats-grid-mini">
            <div class="stat-mini">
              <div class="stat-value-mini">{{ stats.total_sessions || 0 }}</div>
              <div class="stat-label-mini">总对话</div>
            </div>
            <div class="stat-mini">
              <div class="stat-value-mini">{{ stats.today_sessions || 0 }}</div>
              <div class="stat-label-mini">今日</div>
            </div>
            <div class="stat-mini">
              <div class="stat-value-mini">{{ stats.resolve_rate || 0 }}%</div>
              <div class="stat-label-mini">解决率</div>
            </div>
            <div class="stat-mini">
              <div class="stat-value-mini">{{ stats.transfer_rate || 0 }}%</div>
              <div class="stat-label-mini">转人工</div>
            </div>
          </div>
        </div>

        <!-- 最近对话 -->
        <div class="panel-section">
          <h3 class="section-title">📋 最近对话</h3>
          <div class="sessions-list-mini">
            <div
              v-for="session in sessions.slice(0, 5)"
              :key="session.session_id"
              class="session-item-mini"
              :class="{ active: currentSession?.session_id === session.session_id }"
              @click="viewSession(session)"
            >
              <div class="session-id-mini">{{ session.session_id?.slice(-8) }}</div>
              <div class="session-status-mini">
                <el-tag :type="getStatusTagType(session.status)" size="small">
                  {{ getStatusText(session.status) }}
                </el-tag>
              </div>
            </div>
            <div v-if="!sessions.length" class="empty-mini">暂无对话</div>
          </div>
        </div>
      </div>

      <!-- 右侧面板：实时聊天沙盒 -->
      <div class="panel-right">
        <div class="panel-section chat-sandbox">
          <h3 class="section-title">💬 实时聊天沙盒</h3>
          
          <!-- 聊天消息区 -->
          <div class="chat-messages-sandbox">
            <div v-for="(msg, idx) in sandboxMessages" :key="idx" :class="['message-sandbox', msg.role]">
              <div class="message-avatar-sandbox">
                {{ msg.role === 'user' ? '👤' : '🤖' }}
              </div>
                <div class="message-content-sandbox">
                  <div class="message-text-sandbox">{{ msg.content }}</div>
                  <div v-if="msg.refs?.length" class="debug-refs">
                    <el-tag v-for="ref in msg.refs" :key="ref.id" size="small">
                      {{ ref.title }} · {{ Math.round(ref.score * 100) }}%
                    </el-tag>
                  </div>
                  <div class="message-time-sandbox">{{ formatTime(msg.time) }}</div>
              </div>
            </div>
            <div v-if="!sandboxMessages.length" class="empty-sandbox">
              发送消息测试 AI 客服效果
            </div>
          </div>

          <div v-if="lastDebug" class="debug-panel">
            <div><strong>路径：</strong>{{ lastDebug.answer_mode }} · <strong>调用 AI：</strong>{{ lastDebug.ai_used ? '是' : '否' }}</div>
            <div><strong>模型：</strong>{{ lastDebug.diagnostics?.provider || '-' }} / {{ lastDebug.diagnostics?.model || '-' }}</div>
            <div><strong>耗时：</strong>召回 {{ lastDebug.diagnostics?.retrieval_ms || 0 }} ms · 生成 {{ lastDebug.diagnostics?.generation_ms || 0 }} ms · 总计 {{ lastDebug.diagnostics?.total_ms || 0 }} ms</div>
            <div v-if="lastDebug.fallback_reason"><strong>降级原因：</strong>{{ lastDebug.fallback_reason }}</div>
          </div>

          <!-- 输入区 -->
          <div class="chat-input-sandbox">
            <el-select v-model="debugPlatform" style="width: 120px;" placeholder="平台">
              <el-option label="亚马逊" value="amazon" />
              <el-option label="速卖通" value="aliexpress" />
            </el-select>
            <el-input
              v-model="testMessage"
              placeholder="输入测试消息..."
              @keyup.enter="sendTest"
              :disabled="sendingTest"
            />
            <el-button type="primary" @click="sendTest" :loading="sendingTest">
              发送
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getAIChatConfig, updateAIChatConfig, getAdminChatSessions, getAdminChatSession, getAIChatStats, debugAIChat } from '@/utils/api'
import { showToast } from '@/utils'
import { usePlatformStore } from '@/stores/platform'

const platformStore = usePlatformStore()

// 配置
const config = ref({
  welcome_message: '',
  suggested_questions: '[]',
  transfer_rules: '{}',
  ai_model: 'qwen-turbo',
  reply_style: 'concise'
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

// 沙盒测试
const testMessage = ref('')
const sandboxMessages = ref([])
const sendingTest = ref(false)
const lastDebug = ref(null)
const debugPlatform = ref(platformStore.adminPlatform === 'all' ? 'amazon' : platformStore.adminPlatform)

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
      suggested_questions: suggestedQuestions.value.filter(q => q.trim()),
      transfer_rules: transferRules.value,
      ai_model: config.value.ai_model,
      reply_style: config.value.reply_style
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

// 沙盒测试发送
async function sendTest() {
  if (!testMessage.value.trim()) return
  
  const userMsg = {
    role: 'user',
    content: testMessage.value.trim(),
    time: new Date().toISOString()
  }
  sandboxMessages.value.push(userMsg)
  testMessage.value = ''
  sendingTest.value = true
  
  try {
    const result = await debugAIChat({
      message: userMsg.content,
      platform_key: debugPlatform.value,
      top_k: 5,
      min_score: 0.3,
    })
    lastDebug.value = result
    sandboxMessages.value.push({
      role: 'ai',
      content: result.reply,
      refs: result.knowledge_refs || [],
      time: new Date().toISOString()
    })
  } catch (err) {
    showToast(err.message || '调试失败', 'error')
  } finally {
    sendingTest.value = false
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
  max-width: 100% !important;
}

.config-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.debug-panel { margin: 12px 0; padding: 10px; border: 1px solid var(--color-border); border-radius: 8px; font-size: 12px; line-height: 1.8; background: var(--color-surface-soft); }
.debug-refs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }

.page-header {
  margin-bottom: 1.5rem;
}

.page-title {
  font-family: var(--font-family);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

/* ===== Master-Detail 双栏布局 ===== */
.master-detail-container {
  display: flex;
  gap: 20px;
  width: 100%;
  height: calc(100vh - 120px);
}

.panel-left {
  flex: 0 0 35%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.panel-right {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.panel-section {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 6px 16px rgba(0,0,0,0.03);
}

.section-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 1rem 0;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
}

/* ===== 左侧面板：配置区 ===== */
.config-section {
  margin-bottom: 1rem;
}

.config-section label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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

/* ===== 左侧面板：数据看板 ===== */
.stats-grid-mini {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.stat-mini {
  background: var(--color-canvas);
  border-radius: var(--radius-md);
  padding: 12px;
  text-align: center;
}

.stat-value-mini {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.2;
}

.stat-label-mini {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

/* ===== 左侧面板：最近对话 ===== */
.sessions-list-mini {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-item-mini {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--color-canvas);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.session-item-mini:hover {
  background: var(--color-surface-soft);
  transform: translateX(2px);
}

.session-item-mini.active {
  background: rgba(14, 165, 233, 0.08);
  border-left: 3px solid var(--color-primary);
}

.session-id-mini {
  font-family: monospace;
  font-size: 0.8rem;
  color: var(--color-text);
}

.empty-mini {
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  padding: 1rem;
}

/* ===== 右侧面板：聊天沙盒 ===== */
.chat-sandbox {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-messages-sandbox {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background: var(--color-canvas);
  border-radius: var(--radius-md);
  margin-bottom: 1rem;
  min-height: 300px;
}

.message-sandbox {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  animation: messageSlideIn 0.3s ease;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-sandbox.user {
  flex-direction: row-reverse;
}

.message-avatar-sandbox {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.message-content-sandbox {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--color-surface);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.message-sandbox.user .message-content-sandbox {
  background: var(--color-primary);
  color: white;
}

.message-text-sandbox {
  font-size: 0.9rem;
  line-height: 1.5;
  word-break: break-word;
}

.message-time-sandbox {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  margin-top: 6px;
  text-align: right;
}

.message-sandbox.user .message-time-sandbox {
  color: rgba(255, 255, 255, 0.7);
}

.empty-sandbox {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.chat-input-sandbox {
  display: flex;
  gap: 12px;
}

.chat-input-sandbox :deep(.el-input) {
  flex: 1;
}

/* ===== 响应式 ===== */
@media (max-width: 1024px) {
  .master-detail-container {
    flex-direction: column;
    height: auto;
  }
  
  .panel-left {
    flex: none;
  }
  
  .panel-right {
    min-height: 500px;
  }
}
</style>
