<template>
  <div class="ai-chat-container">
    <div class="chat-header">
      <div><span>执行支持</span><h2>工具帮助</h2><p>遇到授权、设备或自动操作问题，直接描述你看到的情况。</p></div>
      <button v-if="sessionId" class="btn btn-secondary" @click="showHistory = true">历史记录</button>
    </div>

    <div ref="messagesContainer" class="chat-messages" role="log" aria-live="polite" :aria-busy="isLoading">
      <div v-if="!sessionId" class="welcome-message">
        <div class="typing-indicator"><span></span><span></span><span></span></div>
        <p>正在连接客服…</p>
      </div>

      <div v-else>
        <div v-for="msg in messages" :key="msg.id" :class="['message', msg.role]">
          <div class="message-avatar" aria-hidden="true">
            {{ msg.role === 'user' ? '' : msg.role === 'ai' ? '' : '⚙️' }}
          </div>
          <div class="message-content">
            <div class="message-text" style="white-space: pre-wrap;">{{ msg.content }}</div>
            <div v-if="msg.knowledge_refs?.length" class="message-refs">
              <span class="ref-label">参考知识：</span>
              <span v-for="ref in msg.knowledge_refs" :key="ref.id" class="ref-tag">
                {{ ref.title }}
              </span>
            </div>
            <div v-else-if="msg.knowledge_ids?.length" class="message-refs">
              <span class="ref-label">参考知识：</span>
              <span v-for="kid in msg.knowledge_ids" :key="kid" class="ref-tag">#{{ kid }}</span>
            </div>
            <div class="message-time">{{ formatTime(msg.created_at) }}</div>
          </div>
        </div>

        <div v-if="isLoading" class="message ai">
          <div class="message-avatar" aria-hidden="true">规</div>
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

        <div v-if="messages.length <= 1 && !isLoading && !sessionResolved" class="quick-questions">
          <button v-for="question in quickQuestions" :key="question" type="button" @click="askQuickQuestion(question)">
            {{ question }}
          </button>
        </div>

        <div v-if="showRating" class="rating-panel">
          <p>请为本次服务评分：</p>
          <div class="rating-stars">
            <button v-for="star in 5" :key="star" type="button" class="star" :class="{ active: star <= rating }" :aria-label="`${star} 星`" :aria-pressed="star === rating" @click="submitRating(star)">★</button>
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

    <form v-if="sessionId && !sessionResolved && !sessionTransferred" class="chat-input" @submit.prevent="sendMessage">
      <label class="sr-only" for="support-question">描述你的问题</label>
      <input
        id="support-question"
        v-model="inputMessage"
        type="text"
        placeholder="输入您的问题..."
        :disabled="isLoading"
      />
      <button type="submit" class="btn btn-primary" :disabled="isLoading || !inputMessage.trim()">
        发送
      </button>
    </form>

    <!-- History Modal -->
    <div v-if="showHistory" class="modal-overlay" @click.self="showHistory = false">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <h3 id="history-title">对话历史</h3>
        <div class="history-list">
          <button v-for="session in historySessions" :key="session.session_id" type="button" class="history-item" @click="loadSession(session.session_id)">
            <div class="history-info">
              <span class="history-status" :class="session.status">{{ getStatusText(session.status) }}</span>
              <span class="history-time">{{ formatTime(session.created_at) }}</span>
            </div>
            <div class="history-meta">{{ session.message_count }} 条消息</div>
          </button>
          <div v-if="!historySessions.length" class="empty-history">暂无历史记录</div>
        </div>
        <button class="btn btn-secondary" @click="showHistory = false">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCustomerSupportChat } from '@/features/ai/useCustomerSupportChat'

const {
  sessionId, messages, inputMessage, isLoading, showActions, showRating, rating,
  sessionResolved, sessionTransferred, lastAiMessage, messagesContainer, showHistory,
  historySessions, quickQuestions, formatTime, getStatusText, askQuickQuestion,
  sendMessage, markResolved, transferToHuman, submitRating, loadSession,
} = useCustomerSupportChat()
</script>

<style scoped>
.ai-chat-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  max-width: 900px;
  margin: 0 auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-low);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.chat-header h2 {
  margin: 3px 0 0;
  color: var(--color-text);
  font-size: 20px;
  letter-spacing: -.02em;
}
.chat-header div > span { color: var(--color-primary); font-size:var(--type-micro); font-weight: 800; letter-spacing: .12em; }
.chat-header p { margin: 5px 0 0; color: var(--color-text-secondary); font-size:var(--type-control); }

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
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  font-size: 1rem;
  flex-shrink: 0;
}

.message-content {
  max-width: 70%;
  background: var(--color-surface-soft);
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 12px 12px 12px 4px;
  position: relative;
}

.message.user .message-content {
  border-color: var(--color-primary);
  border-radius: 12px 12px 4px 12px;
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
  animation: typing var(--motion-ambient) infinite;
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

.quick-questions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 52px 20px;
}

.quick-questions button {
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text);
  background: white;
  font-size:var(--type-control);
  cursor: pointer;
}

.quick-questions button:hover {
  color: var(--color-primary);
  border-color: var(--color-primary-muted);
  background: var(--color-primary-soft);
}

.rating-panel {
  text-align: center;
  padding: 1rem;
  background: var(--color-surface-soft);
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
  padding: 2px;
  border: 0;
  background: transparent;
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
  background: var(--color-success-soft);
  color: var(--color-success);
  border-radius: 8px;
  margin: 1rem 0;
}

.transferred-notice {
  text-align: center;
  padding: 0.75rem;
  background: var(--color-warning-soft);
  color: var(--color-warning);
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
  box-shadow: 0 0 0 3px var(--color-focus-ring);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-overlay);
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
  width: 100%;
  display: block;
  text-align: left;
  color: inherit;
  background: var(--color-surface);
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: background 0.2s;
}

.history-item:hover {
  background: var(--color-surface-soft);
}

.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

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

.history-status.active { background: rgba(14, 165, 233, 0.1); color: var(--color-primary); }
.history-status.resolved { background: rgba(16, 185, 129, 0.1); color: var(--color-success); }
.history-status.transferred { background: rgba(255, 153, 0, 0.1); color: var(--color-warning); }

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
  background: var(--color-success);
  color: white;
}

.btn-warning {
  background: var(--color-warning);
  color: white;
}

@media (max-width: 640px) {
  .ai-chat-container { height: calc(100vh - 100px); }
  .chat-header { padding: 16px; }
  .chat-header p { display: none; }
  .chat-messages { padding: 16px; }
  .message-content { max-width: 84%; }
  .quick-questions { margin: 10px 0 16px 42px; }
  .chat-input { padding: 12px; }
}
</style>
