<template>
  <div class="ai-chat-container">
    <div class="chat-header">
      <h2>AI 智能客服</h2>
      <button v-if="sessionId" class="btn btn-secondary" @click="showHistory = true">历史记录</button>
    </div>

    <div class="chat-messages" ref="messagesContainer">
      <div v-if="!sessionId" class="welcome-message">
        <div class="welcome-icon">🤖</div>
        <h3>欢迎使用 AI 智能客服</h3>
        <p>我可以帮您解答关于工具箱使用、授权、安装等方面的问题</p>
        <button class="btn btn-primary" @click="startNewSession">开始对话</button>
      </div>

      <div v-else>
        <div v-for="msg in messages" :key="msg.id" :class="['message', msg.role]">
          <div class="message-avatar">
            {{ msg.role === 'user' ? '' : msg.role === 'ai' ? '' : '⚙️' }}
          </div>
          <div class="message-content">
            <div class="message-text" style="white-space: pre-wrap;">{{ msg.content }}</div>
            <div v-if="msg.knowledge_ids && msg.knowledge_ids.length" class="message-refs">
              <span class="ref-label">参考知识：</span>
              <span v-for="kid in msg.knowledge_ids" :key="kid" class="ref-tag">#{{ kid }}</span>
            </div>
            <div class="message-time">{{ formatTime(msg.created_at) }}</div>
          </div>
        </div>

        <div v-if="isLoading" class="message ai">
          <div class="message-avatar">🤖</div>
          <div class="message-content">
            <div class="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>

        <div v-if="showActions && lastAiMessage && !sessionResolved && !sessionTransferred" class="message-actions">
          <button class="btn btn-success" @click="markResolved">✓ 已解决</button>
          <button class="btn btn-warning" @click="transferToHuman">转人工客服</button>
        </div>

        <div v-if="showRating" class="rating-panel">
          <p>请为本次服务评分：</p>
          <div class="rating-stars">
            <span v-for="star in 5" :key="star" class="star" :class="{ active: star <= rating }" @click="submitRating(star)">★</span>
          </div>
        </div>

        <div v-if="sessionResolved && !sessionTransferred" class="resolved-notice">
          <span>✓</span> 本次咨询已解决
        </div>

        <div v-if="sessionTransferred" class="transferred-notice">
          <span></span> 已为您创建工单，人工客服将尽快与您联系
        </div>
      </div>
    </div>

    <div v-if="sessionId && !sessionResolved && !sessionTransferred" class="chat-input">
      <input
        v-model="inputMessage"
        type="text"
        placeholder="输入您的问题..."
        @keyup.enter="sendMessage"
        :disabled="isLoading"
      />
      <button class="btn btn-primary" @click="sendMessage" :disabled="isLoading || !inputMessage.trim()">
        发送
      </button>
    </div>

    <!-- History Modal -->
    <div v-if="showHistory" class="modal-overlay" @click.self="showHistory = false">
      <div class="modal">
        <h3>对话历史</h3>
        <div class="history-list">
          <div v-for="session in historySessions" :key="session.session_id" class="history-item" @click="loadSession(session.session_id)">
            <div class="history-info">
              <span class="history-status" :class="session.status">{{ getStatusText(session.status) }}</span>
              <span class="history-time">{{ formatTime(session.created_at) }}</span>
            </div>
            <div class="history-meta">{{ session.message_count }} 条消息</div>
          </div>
          <div v-if="!historySessions.length" class="empty-history">暂无历史记录</div>
        </div>
        <button class="btn btn-secondary" @click="showHistory = false">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { createChatSession, sendChatMessage, getChatSession, resolveChatSession, transferChatToHuman, rateChatSession, getChatHistory, api } from '@/utils/api'
import { showToast } from '@/utils'
import { usePlatformStore } from '@/stores/platform'

const platformStore = usePlatformStore()

const sessionId = ref(null)
const messages = ref([])
const inputMessage = ref('')
const isLoading = ref(false)
const showActions = ref(false)
const showRating = ref(false)
const rating = ref(0)
const sessionResolved = ref(false)
const sessionTransferred = ref(false)
const lastAiMessage = ref(null)
const messagesContainer = ref(null)
const showHistory = ref(false)
const historySessions = ref([])
let nextMsgId = 0

function formatTime(timeStr) {
  if (!timeStr) return ''
  const d = new Date(timeStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getStatusText(status) {
  const map = { active: '进行中', resolved: '已解决', transferred: '已转人工' }
  return map[status] || status
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

async function startNewSession() {
  try {
    const res = await createChatSession({ platform_key: platformStore.currentPlatform })
    sessionId.value = res.session_id
    nextMsgId = 1
    messages.value = [{
      id: nextMsgId++,
      role: 'system',
      content: res.welcome_message || '您好！我是 AI 客服，请问有什么可以帮您？',
      created_at: new Date().toISOString()
    }]
    showActions.value = false
    showRating.value = false
    sessionResolved.value = false
    sessionTransferred.value = false
    scrollToBottom()
  } catch (err) {
    showToast('创建会话失败', 'error')
  }
}

async function sendMessage() {
  const text = inputMessage.value.trim()
  if (!text || isLoading.value) return

  messages.value.push({
    id: nextMsgId++,
    role: 'user',
    content: text,
    created_at: new Date().toISOString()
  })
  inputMessage.value = ''
  isLoading.value = true
  showActions.value = false
  scrollToBottom()

  try {
    // 1. 先查询 FAQ（不调用 AI）
    const faqRes = await api.post('/api/help/query', {
      question: text,
      platform_key: platformStore.currentPlatform,
    })

    if (faqRes.success && faqRes.data) {
      if (faqRes.data.matched && !faqRes.data.ai_used) {
        // FAQ 命中，直接展示答案，不调用 AI
        messages.value.push({
          id: nextMsgId++,
          role: 'ai',
          content: faqRes.data.answer,
          knowledge_ids: faqRes.data.faq_id ? [faqRes.data.faq_id] : [],
          created_at: new Date().toISOString()
        })
        lastAiMessage.value = faqRes.data.answer
        showActions.value = true
        isLoading.value = false
        scrollToBottom()
        return
      }

      if (faqRes.data.need_ai) {
        // FAQ 未命中，提示用户是否使用 AI 诊断
        messages.value.push({
          id: nextMsgId++,
          role: 'ai',
          content: '未找到匹配的 FAQ 答案。是否使用 AI 智能诊断来帮您解答？',
          created_at: new Date().toISOString()
        })
        // 添加 AI 诊断按钮
        messages.value.push({
          id: nextMsgId++,
          role: 'system',
          content: '__AI_DIAGNOSIS_PROMPT__',
          created_at: new Date().toISOString()
        })
        isLoading.value = false
        scrollToBottom()
        return
      }
    }

    // 2. FAQ 未命中且用户确认，或 FAQ 查询失败，调用 AI
    const res = await sendChatMessage(sessionId.value, text, { platform_key: platformStore.currentPlatform })
    messages.value.push({
      id: nextMsgId++,
      role: 'ai',
      content: res.reply,
      knowledge_ids: res.knowledge_refs?.map(r => r.id) || [],
      created_at: new Date().toISOString()
    })
    lastAiMessage.value = res.reply
    showActions.value = true
  } catch (err) {
    messages.value.push({
      id: nextMsgId++,
      role: 'ai',
      content: '抱歉，发送消息失败，请检查网络连接后重试。如果问题持续，请点击「转人工客服」。',
      created_at: new Date().toISOString()
    })
    showToast('发送失败', 'error')
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

// AI 诊断确认
async function confirmAIDiagnosis() {
  // 找到最后一个用户消息
  const lastUserMsg = [...messages.value].reverse().find(m => m.role === 'user')
  if (!lastUserMsg) return

  // 移除提示消息
  messages.value = messages.value.filter(m => m.content !== '__AI_DIAGNOSIS_PROMPT__')

  isLoading.value = true
  scrollToBottom()

  try {
    const res = await sendChatMessage(sessionId.value, lastUserMsg.content, { platform_key: platformStore.currentPlatform })
    messages.value.push({
      id: nextMsgId++,
      role: 'ai',
      content: res.reply,
      knowledge_ids: res.knowledge_refs?.map(r => r.id) || [],
      created_at: new Date().toISOString()
    })
    lastAiMessage.value = res.reply
    showActions.value = true
  } catch (err) {
    messages.value.push({
      id: nextMsgId++,
      role: 'ai',
      content: '抱歉，AI 诊断失败，请检查网络连接后重试。',
      created_at: new Date().toISOString()
    })
    showToast('AI 诊断失败', 'error')
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

async function markResolved() {
  showActions.value = false
  showRating.value = true
}

async function submitRating(star) {
  rating.value = star
  try {
    await resolveChatSession(sessionId.value, star)
    showRating.value = false
    sessionResolved.value = true
    showToast('感谢您的反馈！', 'success')
  } catch (err) {
    showToast('提交失败', 'error')
  }
}

async function transferToHuman() {
  if (!confirm('确定要转接人工客服吗？')) return
  try {
    await transferChatToHuman(sessionId.value)
    showActions.value = false
    sessionTransferred.value = true
    messages.value.push({
      id: nextMsgId++,
      role: 'system',
      content: '已为您创建工单，人工客服将尽快与您联系。',
      created_at: new Date().toISOString()
    })
    scrollToBottom()
    showToast('已转人工客服', 'success')
  } catch (err) {
    showToast('转接失败', 'error')
  }
}

async function loadHistory() {
  try {
    const res = await getChatHistory(1, 20)
    historySessions.value = res.items || []
  } catch (err) {
    showToast('加载历史失败', 'error')
  }
}

async function loadSession(sid) {
  try {
    const res = await getChatSession(sid)
    sessionId.value = sid
    messages.value = res.messages || []
    sessionResolved.value = res.status === 'resolved'
    sessionTransferred.value = res.status === 'transferred'
    showActions.value = res.status === 'active' && messages.value.some(m => m.role === 'ai')
    showHistory.value = false
    scrollToBottom()
  } catch (err) {
    showToast('加载会话失败', 'error')
  }
}

onMounted(() => {
  loadHistory()
})
</script>

<style scoped>
.ai-chat-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  max-width: 900px;
  margin: 0 auto;
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.chat-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.welcome-message {
  text-align: center;
  padding: 3rem 1rem;
}

.welcome-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.welcome-message h3 {
  margin: 0.5rem 0;
}

.welcome-message p {
  color: var(--color-text-secondary);
  margin-bottom: 1.5rem;
}

.message {
  display: flex;
  margin-bottom: 1rem;
  gap: 0.75rem;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.message-content {
  max-width: 70%;
  background: var(--color-bg-secondary);
  padding: 0.75rem 1rem;
  border-radius: 12px;
  position: relative;
}

.message.user .message-content {
  background: var(--color-primary);
  color: white;
}

.message-text {
  line-height: 1.5;
  word-break: break-word;
}

.message-refs {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(0,0,0,0.1);
  font-size: 0.8rem;
}

.ref-label {
  color: var(--color-text-secondary);
  margin-right: 0.5rem;
}

.ref-tag {
  display: inline-block;
  background: rgba(0,0,0,0.1);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  margin-right: 0.3rem;
  font-size: 0.75rem;
}

.message-time {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  margin-top: 0.3rem;
  text-align: right;
}

.message.user .message-time {
  color: rgba(255,255,255,0.7);
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 0.5rem 0;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: var(--color-text-secondary);
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-8px); opacity: 1; }
}

.message-actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin: 1rem 0;
}

.rating-panel {
  text-align: center;
  padding: 1rem;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  margin: 1rem 0;
}

.rating-stars {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.star {
  font-size: 2rem;
  cursor: pointer;
  color: var(--color-border);
  transition: color 0.2s;
}

.star.active,
.star:hover {
  color: #fbbf24;
}

.resolved-notice {
  text-align: center;
  padding: 0.75rem;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  border-radius: 8px;
  margin: 1rem 0;
}

.transferred-notice {
  text-align: center;
  padding: 0.75rem;
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border-radius: 8px;
  margin: 1rem 0;
}

.chat-input {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-border);
}

.chat-input input {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.95rem;
}

.chat-input input:focus {
  outline: none;
  border-color: var(--color-primary);
}

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
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal h3 {
  margin: 0 0 1rem 0;
}

.history-list {
  margin-bottom: 1rem;
}

.history-item {
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: background 0.2s;
}

.history-item:hover {
  background: var(--color-bg-secondary);
}

.history-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.history-status {
  font-size: 0.8rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.history-status.active { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.history-status.resolved { background: rgba(16, 185, 129, 0.1); color: #10b981; }
.history-status.transferred { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }

.history-time {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.history-meta {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 0.3rem;
}

.empty-history {
  text-align: center;
  color: var(--color-text-secondary);
  padding: 2rem;
}

.btn-success {
  background: #10b981;
  color: white;
}

.btn-warning {
  background: #f59e0b;
  color: white;
}
</style>