<template>
  <transition name="fade">
    <div v-if="showModal && currentAnnouncement" class="announcement-overlay" @click.self="dismiss">
      <transition name="modal-pop">
        <div v-if="showModal && currentAnnouncement" class="announcement-modal" :class="currentAnnouncement.type">
          <!-- 顶部装饰条 -->
          <div class="modal-accent"></div>

          <!-- 关闭按钮 -->
          <button class="modal-close-btn" @click="dismiss" aria-label="关闭公告">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>

          <!-- 内容区域 -->
          <div class="modal-body">
            <!-- 图标和标题 -->
            <div class="modal-header">
              <div class="type-icon" :class="currentAnnouncement.type">
                <svg v-if="currentAnnouncement.type === 'system'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
                <svg v-else-if="currentAnnouncement.type === 'update'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                <svg v-else-if="currentAnnouncement.type === 'activity'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <div class="header-text">
                <span class="type-label" :class="currentAnnouncement.type">{{ getTypeText(currentAnnouncement.type) }}</span>
                <h3 class="modal-title">{{ currentAnnouncement.title }}</h3>
              </div>
            </div>

            <!-- 公告正文 -->
            <div class="modal-content">
              <p>{{ currentAnnouncement.content }}</p>
            </div>

            <!-- 底部信息 -->
            <div class="modal-footer">
              <span class="publish-time">发布于 {{ formatDate(currentAnnouncement.created_at) }}</span>
              <div class="modal-actions">
                <button v-if="hasMore" class="btn-next" @click="nextAnnouncement">
                  下一条
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
                <button class="btn-close" @click="dismiss">我知道了</button>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getActiveAnnouncements } from '@/utils/api'

const showModal = ref(false)
const announcements = ref([])
const currentIndex = ref(0)
const dismissedIds = ref([])

const currentAnnouncement = computed(() => {
  return announcements.value[currentIndex.value] || null
})

const hasMore = computed(() => {
  return currentIndex.value < announcements.value.length - 1
})

function getTypeText(type) {
  const map = {
    system: '系统通知',
    update: '版本更新',
    activity: '活动公告',
    maintenance: '维护通知'
  }
  return map[type] || '公告'
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function dismiss() {
  if (currentAnnouncement.value) {
    dismissedIds.value.push(currentAnnouncement.value.id)
    localStorage.setItem('dismissed_announcements', JSON.stringify(dismissedIds.value))
  }
  if (hasMore.value) {
    currentIndex.value++
  } else {
    showModal.value = false
  }
}

function nextAnnouncement() {
  if (hasMore.value) {
    currentIndex.value++
  }
}

onMounted(async () => {
  try {
    const stored = localStorage.getItem('dismissed_announcements')
    if (stored) {
      dismissedIds.value = JSON.parse(stored)
    }

    const result = await getActiveAnnouncements()
    const activeAnnouncements = result || []

    if (activeAnnouncements.length > 0) {
      announcements.value = activeAnnouncements.filter(a => !dismissedIds.value.includes(a.id))
      if (announcements.value.length > 0) {
        showModal.value = true
      }
    }
  } catch (err) {
    console.warn('Failed to load announcements:', err)
  }
})
</script>

<style scoped>
/* 遮罩层 */
.announcement-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

/* 弹窗卡片 */
.announcement-modal {
  background: white;
  border-radius: 20px;
  max-width: 480px;
  width: 100%;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  position: relative;
}

/* 顶部装饰条 */
.modal-accent {
  height: 3px;
  width: 100%;
}

.announcement-modal.system .modal-accent {
  background: linear-gradient(90deg, #6366F1, #818CF8);
}

.announcement-modal.update .modal-accent {
  background: linear-gradient(90deg, #3B82F6, #60A5FA);
}

.announcement-modal.activity .modal-accent {
  background: linear-gradient(90deg, #F59E0B, #FBBF24);
}

.announcement-modal.maintenance .modal-accent {
  background: linear-gradient(90deg, #EF4444, #F87171);
}

/* 关闭按钮 */
.modal-close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.05);
  border: none;
  border-radius: 8px;
  color: #64748B;
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 10;
}

.modal-close-btn:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #0F172A;
}

/* 内容区域 */
.modal-body {
  padding: 2rem;
}

/* 头部 */
.modal-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.type-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.type-icon svg {
  width: 24px;
  height: 24px;
  color: white;
}

.type-icon.system {
  background: linear-gradient(135deg, #6366F1, #818CF8);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.type-icon.update {
  background: linear-gradient(135deg, #3B82F6, #60A5FA);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.type-icon.activity {
  background: linear-gradient(135deg, #F59E0B, #FBBF24);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}

.type-icon.maintenance {
  background: linear-gradient(135deg, #EF4444, #F87171);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.header-text {
  flex: 1;
  min-width: 0;
}

.type-label {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  margin-bottom: 0.4rem;
}

.type-label.system {
  background: rgba(99, 102, 241, 0.1);
  color: #6366F1;
}

.type-label.update {
  background: rgba(59, 130, 246, 0.1);
  color: #3B82F6;
}

.type-label.activity {
  background: rgba(245, 158, 11, 0.1);
  color: #F59E0B;
}

.type-label.maintenance {
  background: rgba(239, 68, 68, 0.1);
  color: #EF4444;
}

.modal-title {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 700;
  color: #0F172A;
  margin: 0;
  line-height: 1.3;
}

/* 正文 */
.modal-content {
  margin-bottom: 1.5rem;
}

.modal-content p {
  font-size: 0.95rem;
  line-height: 1.7;
  color: #475569;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 底部 */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 1rem;
  border-top: 1px solid #E2E8F0;
}

.publish-time {
  font-size: 0.8rem;
  color: #94A3B8;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-next {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1.2rem;
  background: linear-gradient(135deg, #6366F1, #4F46E5);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-next:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.btn-close {
  padding: 0.6rem 1.2rem;
  background: #F1F5F9;
  color: #475569;
  border: none;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-close:hover {
  background: #E2E8F0;
  color: #0F172A;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.modal-pop-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-pop-leave-active {
  transition: all 0.2s ease;
}

.modal-pop-enter-from {
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}

.modal-pop-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* 响应式 */
@media (max-width: 480px) {
  .modal-body {
    padding: 1.5rem;
  }

  .modal-title {
    font-size: 1.1rem;
  }

  .modal-footer {
    flex-direction: column;
    gap: 1rem;
    align-items: stretch;
  }

  .modal-actions {
    justify-content: flex-end;
  }
}
</style>