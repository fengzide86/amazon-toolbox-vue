<template>
  <main class="login-page">
    <!-- 左侧品牌区 -->
    <div class="login-brand">
      <!-- 动态背景网格 -->
      <div class="grid-bg"></div>
      <!-- 装饰几何图形 -->
      <div class="brand-shapes">
        <div class="shape shape-circle-1"></div>
        <div class="shape shape-circle-2"></div>
        <div class="shape shape-circle-3"></div>
        <div class="shape shape-ring-1"></div>
        <div class="shape shape-ring-2"></div>
        <div class="shape shape-dot-1"></div>
        <div class="shape shape-dot-2"></div>
        <div class="shape shape-dot-3"></div>
        <div class="shape shape-line-1"></div>
        <div class="shape shape-line-2"></div>
      </div>

      <div class="brand-content">
        <!-- Logo -->
        <div class="brand-logo">
          <div class="logo-mark">
            <Zap :size="24" />
          </div>
        </div>

        <h1 class="brand-title">亚马逊赛训效率工具箱</h1>
        <p class="brand-subtitle">比赛 · 实训 · 交付</p>
        <div class="brand-divider">
          <span class="divider-line"></span>
          <span class="divider-dot"></span>
          <span class="divider-line"></span>
        </div>
        <p class="brand-desc">面向亚马逊赛训与跨境电商实训场景<br>提供轻量化效率工具，提升操作效率</p>

        <!-- 核心数据 -->
        <div class="brand-stats">
          <div class="stat-item" v-for="(stat, index) in stats" :key="index">
            <div class="stat-number-wrapper">
              <span class="stat-number" :style="{ animationDelay: `${index * 0.2}s` }">{{ stat.value }}</span>
              <span class="stat-unit">{{ stat.unit }}</span>
            </div>
            <div class="stat-line"></div>
            <div class="stat-desc">{{ stat.desc }}</div>
          </div>
        </div>

        <!-- 功能标签 -->
        <div class="feature-tags">
          <span class="feature-tag" v-for="tag in featureTags" :key="tag">
            <Check :size="12" />
            {{ tag }}
          </span>
        </div>
      </div>
    </div>

    <!-- 右侧登录区 -->
    <div class="login-form-section">
      <div class="login-form-card">
        <!-- 顶部装饰 -->
        <div class="card-accent"></div>

        <div class="logo-section">
          <div class="logo-icon">
            <Zap :size="28" />
          </div>
          <h2>授权码登录</h2>
          <p>请输入授权码激活您的工具箱</p>
        </div>

        <!-- 错误消息 -->
        <div class="error-message" :class="{ show: showError }">
          <CircleAlert :size="18" />
          <span>{{ errorMessage }}</span>
        </div>

        <!-- 成功消息 -->
        <div class="success-message" :class="{ show: showSuccess }">
          <CircleCheck :size="18" />
          <span>授权成功！正在跳转到首页...</span>
        </div>

        <!-- 连接状态 -->
        <div class="connection-status" :class="connectionStatusClass">
          <span class="status-dot"></span>
          <span>{{ connectionStatusText }}</span>
        </div>

        <form @submit.prevent="handleLogin">
          <div class="form-group">
            <label for="authCode">授权码</label>
            <div class="input-wrapper">
              <span class="input-icon">
                <KeyRound :size="18" />
              </span>
              <input
                type="text"
                id="authCode"
                v-model="authCode"
                placeholder="请输入您的授权码"
                autocomplete="off"
                required
                @focus="inputFocused = true"
                @blur="inputFocused = false"
              >
              <span class="input-highlight" :class="{ active: inputFocused }"></span>
            </div>
          </div>

          <div class="device-info">
            <Monitor :size="16" />
            <span>已检测到设备：<strong>{{ deviceName }}</strong></span>
          </div>

          <button type="submit" class="btn-login" :disabled="isLoading" :aria-busy="isLoading">
            <span class="btn-content" :class="{ hidden: isLoading }">
              <LogIn :size="20" />
              验证并登录
            </span>
            <span class="btn-loading" :class="{ visible: isLoading }">
              <Loader :size="20" class="spinner" />
              验证中...
            </span>
          </button>
        </form>

        <nav class="footer-links" aria-label="其他操作">
          <a href="#" @click.prevent="showHelp" class="footer-link">
            <HelpCircle :size="14" />
            使用帮助
          </a>
          <span class="footer-divider"></span>
          <a href="#" @click.prevent="showContact" class="footer-link">
            <Phone :size="14" />
            联系客服
          </a>
          <span class="footer-divider"></span>
          <a href="#/user/terms" class="footer-link">
            <FileText :size="14" />
            服务条款
          </a>
          <span class="footer-divider"></span>
          <a href="#/admin/login" class="footer-link admin-link">
            <Shield :size="14" />
            管理员登录
          </a>
        </nav>
      </div>

      <!-- 底部版权 -->
      <div class="login-footer">
        <p>© 2026 亚马逊赛训效率工具箱 · 专业 · 高效 · 可信赖</p>
      </div>
    </div>

    <!-- 帮助弹窗 -->
    <div class="modal-overlay" :class="{ show: showHelpModal }" @click.self="closeModals">
      <div class="modal">
        <button class="modal-close" @click="closeModals" aria-label="关闭">
          <X :size="20" />
        </button>
        <h3>
          <HelpCircle :size="20" />
          如何使用
        </h3>
        <div class="help-steps">
          <div class="help-step" v-for="(step, i) in helpSteps" :key="i">
            <span class="step-number">{{ i + 1 }}</span>
            <span class="step-text">{{ step }}</span>
          </div>
        </div>
        <div class="modal-notice">
          <AlertTriangle :size="16" />
          每个授权码只能绑定一台设备，如需更换设备请联系客服。
        </div>
        <div class="modal-btns">
          <button class="btn-confirm" @click="closeModals">我知道了</button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Auth, showToast, getDeviceId, getDeviceName } from '@/utils'
import { verifyAuthCode } from '@/utils/api'
import { api } from '@/utils/api'
import { useUserStore } from '@/stores/user'
import { Zap, Check, CircleAlert, CircleCheck, KeyRound, Monitor, LogIn, Loader, HelpCircle, Phone, FileText, Shield, X, AlertTriangle } from '@lucide/vue'

const router = useRouter()
const userStore = useUserStore()

const authCode = ref('')
const isLoading = ref(false)
const showError = ref(false)
const showSuccess = ref(false)
const showHelpModal = ref(false)
const errorMessage = ref('')
const inputFocused = ref(false)
const isOnline = ref(true)

const deviceName = ref('')
const deviceId = ref('')
const wechatId = ref('AmazonToolbox_Support')

// 统计数据
const stats = [
  { value: '90', unit: '%', desc: '操作提效 · 一键完成物料/发货' },
  { value: '10', unit: 'x', desc: '上品速度 · 批量处理告别手动' },
  { value: '24', unit: 'h', desc: 'AI 客服 · 问题秒级响应' },
]

// 功能标签
const featureTags = [
  '自动上品',
  '物流模板',
  '自动发货',
  'FBA/AGL',
  '广告脚本',
  '批量操作',
]

// 帮助步骤
const helpSteps = [
  '购买套餐后，您会收到一个授权码',
  '在此页面输入授权码进行激活',
  '系统会自动绑定您的 Windows 设备',
  '激活成功后即可使用所有工具箱功能',
]

// 连接状态
const connectionStatusClass = computed(() => ({
  online: isOnline.value,
  offline: !isOnline.value,
}))

const connectionStatusText = computed(() =>
  isOnline.value ? '服务已连接' : '服务连接中...'
)

// 网络状态检测
function checkOnlineStatus() {
  isOnline.value = navigator.onLine
}

async function loadWechatId() {
  try {
    const settings = await api.get('/api/settings/public')
    const wxSetting = settings.find(s => s.key === 'wechat_id' || s.key === 'service_wechat')
    if (wxSetting && wxSetting.value) {
      wechatId.value = wxSetting.value
    }
    isOnline.value = true
  } catch (e) {
    isOnline.value = false
  }
}

function validateAuthCode(code) {
  const trimmed = code.trim()
  if (!trimmed) return { valid: false, message: '请输入授权码' }
  if (trimmed.length < 4) return { valid: false, message: '授权码格式不正确，请检查后重试' }
  if (!/^[A-Za-z0-9\-]+$/.test(trimmed)) return { valid: false, message: '授权码只能包含字母、数字和连字符' }
  return { valid: true }
}

function handleLogin() {
  showError.value = false
  showSuccess.value = false

  const validation = validateAuthCode(authCode.value)
  if (!validation.valid) {
    errorMessage.value = validation.message
    showError.value = true
    showToast(validation.message, 'error')
    return
  }

  isLoading.value = true

  verifyAuthCode(authCode.value.trim(), deviceId.value, deviceName.value)
    .then((res) => {
      if (res.success) {
        userStore.setLogin({
          token: res.data.token,
          role: 'user',
          auth_code: authCode.value.trim(),
          user: res.data,
        })
        userStore.setDevice(deviceId.value, deviceName.value)
        Auth.set(authCode.value.trim())
        // 存储平台权限信息供 AppHeader 使用
        if (res.data.platform_scope) {
          localStorage.setItem('toolbox_platform_scope', JSON.stringify(res.data.platform_scope))
        }
        showSuccess.value = true
        showToast('授权成功！正在跳转...', 'success')
        // 触发窗口形变为学员窄屏伴侣模式
        window.electronAPI?.resizeWindow('trainee-mini')
        // 直接跳转，不等待
        router.push('/user/dashboard')
      } else {
        errorMessage.value = res.message
        showError.value = true
        showToast(res.message, 'error')
        isLoading.value = false
      }
    })
    .catch((err) => {
      errorMessage.value = '网络连接失败，请检查后端服务'
      showError.value = true
      isOnline.value = false
      showToast('网络连接失败', 'error')
      isLoading.value = false
    })
}

function showHelp() {
  showHelpModal.value = true
}

function showContact() {
  showToast(`客服微信：${wechatId.value}`, 'info')
}

function closeModals() {
  showHelpModal.value = false
}

onMounted(() => {
  deviceId.value = getDeviceId()
  deviceName.value = getDeviceName()
  loadWechatId()
  checkOnlineStatus()
  window.addEventListener('online', checkOnlineStatus)
  window.addEventListener('offline', checkOnlineStatus)
})

onUnmounted(() => {
  window.removeEventListener('online', checkOnlineStatus)
  window.removeEventListener('offline', checkOnlineStatus)
})
</script>

<style scoped>
/* ===== 页面布局 ===== */
.login-page {
  display: flex;
  min-height: 100vh;
  font-family: var(--font-family);
}

/* ===== 左侧品牌区 ===== */
.login-brand {
  flex: 1;
  background: linear-gradient(135deg, #0F172A 0%, #1E1B4B 40%, #312E81 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  position: relative;
  overflow: hidden;
}

/* 网格背景 */
.grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(99, 102, 241, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 102, 241, 0.06) 1px, transparent 1px);
  background-size: 40px 40px;
  z-index: 1;
}

/* 装饰几何图形 */
.brand-shapes {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.shape {
  position: absolute;
}

.shape-circle-1 {
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%);
  border-radius: 50%;
  top: -80px;
  right: -60px;
  animation: float 8s ease-in-out infinite;
}

.shape-circle-2 {
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(255, 153, 0, 0.08) 0%, transparent 70%);
  border-radius: 50%;
  bottom: -40px;
  left: -30px;
  animation: float 6s ease-in-out infinite reverse;
}

.shape-circle-3 {
  width: 150px;
  height: 150px;
  background: radial-gradient(circle, rgba(129, 140, 248, 0.1) 0%, transparent 70%);
  border-radius: 50%;
  top: 50%;
  right: 15%;
  animation: float 10s ease-in-out infinite;
}

.shape-ring-1 {
  width: 180px;
  height: 180px;
  border: 1px solid rgba(99, 102, 241, 0.1);
  border-radius: 50%;
  top: 20%;
  left: 10%;
  animation: spin 20s linear infinite;
}

.shape-ring-2 {
  width: 120px;
  height: 120px;
  border: 1px solid rgba(255, 153, 0, 0.08);
  border-radius: 50%;
  bottom: 25%;
  right: 10%;
  animation: spin 15s linear infinite reverse;
}

.shape-dot-1 {
  width: 6px;
  height: 6px;
  background: rgba(99, 102, 241, 0.3);
  border-radius: 50%;
  top: 30%;
  left: 25%;
  animation: pulse 3s ease-in-out infinite;
}

.shape-dot-2 {
  width: 4px;
  height: 4px;
  background: rgba(255, 153, 0, 0.4);
  border-radius: 50%;
  top: 60%;
  right: 30%;
  animation: pulse 4s ease-in-out infinite 1s;
}

.shape-dot-3 {
  width: 5px;
  height: 5px;
  background: rgba(129, 140, 248, 0.3);
  border-radius: 50%;
  bottom: 35%;
  left: 40%;
  animation: pulse 3.5s ease-in-out infinite 0.5s;
}

.shape-line-1 {
  width: 60px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.2), transparent);
  top: 45%;
  left: 5%;
  transform: rotate(-30deg);
  animation: float 7s ease-in-out infinite;
}

.shape-line-2 {
  width: 80px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 153, 0, 0.15), transparent);
  bottom: 40%;
  right: 5%;
  transform: rotate(20deg);
  animation: float 9s ease-in-out infinite reverse;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-15px); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.5); }
}

/* 品牌内容 */
.brand-content {
  position: relative;
  z-index: 2;
  max-width: 460px;
  animation: fadeInUp 0.8s ease forwards;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Logo */
.brand-logo {
  margin-bottom: 2rem;
}

.logo-mark {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #6366F1, #818CF8);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
}

.logo-mark svg {
  width: 24px;
  height: 24px;
  color: white;
}

/* 标题 */
.brand-title {
  font-family: var(--font-heading);
  font-size: 2.25rem;
  font-weight: 700;
  color: white;
  margin-bottom: 0.5rem;
  line-height: 1.3;
  letter-spacing: -0.02em;
}

.brand-subtitle {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 1.5rem;
  letter-spacing: 0.15em;
}

/* 分隔线 */
.brand-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.divider-line {
  width: 40px;
  height: 2px;
  background: linear-gradient(90deg, #6366F1, #FF9900);
  border-radius: 1px;
}

.divider-dot {
  width: 6px;
  height: 6px;
  background: #FF9900;
  border-radius: 50%;
}

/* 描述 */
.brand-desc {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.6;
  margin-bottom: 2.5rem;
}

/* 统计数据 */
.brand-stats {
  display: flex;
  gap: 2rem;
  margin-bottom: 2rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.stat-number-wrapper {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.stat-number {
  font-family: var(--font-heading);
  font-size: 2.25rem;
  font-weight: 700;
  color: white;
  line-height: 1;
  animation: countUp 0.6s ease forwards;
  opacity: 0;
}

.stat-unit {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 600;
  color: #FF9900;
}

@keyframes countUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.stat-line {
  width: 32px;
  height: 2px;
  background: linear-gradient(90deg, #6366F1, transparent);
  border-radius: 1px;
}

.stat-desc {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.4;
}

/* 功能标签 */
.feature-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.feature-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.75rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.3s ease;
}

.feature-tag:hover {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
  color: white;
}

.feature-tag svg {
  color: #FF9900;
}

/* ===== 右侧登录区 ===== */
.login-form-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: #F8FAFC;
  position: relative;
}

.login-form-card {
  width: 100%;
  max-width: 420px;
  padding: 2.5rem;
  background: white;
  border-radius: 20px;
  border: 1px solid #E2E8F0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 10px 30px -5px rgba(0, 0, 0, 0.06);
  position: relative;
  overflow: hidden;
  animation: slideInRight 0.6s ease forwards;
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

/* 顶部装饰条 */
.card-accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #6366F1, #818CF8, #FF9900);
}

/* Logo 区域 */
.logo-section {
  text-align: center;
  margin-bottom: 2rem;
}

.logo-icon {
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, #6366F1, #818CF8);
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.25);
}

.logo-icon svg {
  width: 28px;
  height: 28px;
  color: white;
}

.logo-section h2 {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 0.4rem;
}

.logo-section p {
  font-size: 0.85rem;
  color: #64748B;
}

/* 错误/成功消息 */
.error-message,
.success-message {
  display: none;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  font-size: 0.85rem;
  margin-bottom: 1rem;
  animation: shakeIn 0.4s ease;
}

@keyframes shakeIn {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

.error-message.show {
  display: flex;
  background: rgba(239, 68, 68, 0.08);
  color: #EF4444;
  border: 1px solid rgba(239, 68, 68, 0.15);
}

.success-message.show {
  display: flex;
  background: rgba(16, 185, 129, 0.08);
  color: #10B981;
  border: 1px solid rgba(16, 185, 129, 0.15);
}

.error-message svg,
.success-message svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* 连接状态 */
.connection-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.connection-status.online {
  background: rgba(16, 185, 129, 0.06);
  color: #10B981;
}

.connection-status.offline {
  background: rgba(245, 158, 11, 0.06);
  color: #F59E0B;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  position: relative;
}

.connection-status.online .status-dot {
  background: #10B981;
}

.connection-status.online .status-dot::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: #10B981;
  opacity: 0.3;
  animation: ping 2s ease-in-out infinite;
}

.connection-status.offline .status-dot {
  background: #F59E0B;
  animation: blink 1.5s ease-in-out infinite;
}

@keyframes ping {
  0% { transform: scale(1); opacity: 0.3; }
  100% { transform: scale(2); opacity: 0; }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* 表单 */
.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #0F172A;
  margin-bottom: 0.5rem;
}

.input-wrapper {
  position: relative;
}

.input-icon {
  position: absolute;
  left: 0.875rem;
  top: 50%;
  transform: translateY(-50%);
  color: #94A3B8;
  pointer-events: none;
  transition: color 0.3s ease;
}

.input-wrapper:focus-within .input-icon {
  color: #6366F1;
}

.input-icon svg {
  width: 18px;
  height: 18px;
}

.input-wrapper input {
  width: 100%;
  padding: 0.8rem 1rem 0.8rem 2.75rem;
  background: #F8FAFC;
  border: 1.5px solid #E2E8F0;
  border-radius: 12px;
  font-size: 0.9rem;
  font-family: var(--font-family);
  color: #0F172A;
  transition: all 0.3s ease;
  outline: none;
}

.input-wrapper input::placeholder {
  color: #94A3B8;
}

.input-wrapper input:focus {
  background: white;
  border-color: #6366F1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

/* 设备信息 */
.device-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #F1F5F9;
  border-radius: 10px;
  font-size: 0.8rem;
  color: #64748B;
  margin-bottom: 1.5rem;
  border: 1px solid #E2E8F0;
}

.device-info svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: #94A3B8;
}

.device-info strong {
  color: #0F172A;
  font-weight: 600;
}

/* 登录按钮 */
.btn-login {
  width: 100%;
  padding: 0.9rem;
  background: linear-gradient(135deg, #6366F1, #4F46E5);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  font-family: var(--font-heading);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  position: relative;
  overflow: hidden;
}

.btn-login::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), transparent);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.btn-login:hover:not(:disabled)::before {
  opacity: 1;
}

.btn-login:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.35);
}

.btn-login:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
}

.btn-login:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-content,
.btn-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.3s ease;
}

.btn-content.hidden {
  opacity: 0;
  transform: translateY(-10px);
  position: absolute;
}

.btn-loading {
  opacity: 0;
  transform: translateY(10px);
  position: absolute;
}

.btn-loading.visible {
  opacity: 1;
  transform: translateY(0);
  position: relative;
}

.btn-login svg {
  width: 20px;
  height: 20px;
}

.spinner {
  animation: spin 0.8s linear infinite;
}

/* 底部链接 */
.footer-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
}

.footer-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: #64748B;
  text-decoration: none;
  transition: all 0.2s ease;
  padding: 0.25rem 0.4rem;
  border-radius: 6px;
}

.footer-link:hover {
  color: #6366F1;
  background: rgba(99, 102, 241, 0.05);
}

.footer-link svg {
  width: 14px;
  height: 14px;
}

.footer-divider {
  width: 1px;
  height: 12px;
  background: #E2E8F0;
}

.admin-link {
  color: #6366F1;
  font-weight: 500;
}

.admin-link:hover {
  color: #4F46E5;
  background: rgba(99, 102, 241, 0.08);
}

/* 底部版权 */
.login-footer {
  margin-top: 2rem;
  text-align: center;
}

.login-footer p {
  font-size: 0.75rem;
  color: #94A3B8;
}

/* ===== 弹窗 ===== */
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(8px);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}

.modal-overlay.show {
  display: flex;
}

.modal {
  background: white;
  border-radius: 20px;
  padding: 2rem;
  max-width: 440px;
  width: 90%;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
  position: relative;
  animation: modalIn 0.3s ease;
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #94A3B8;
  cursor: pointer;
  transition: all 0.2s ease;
}

.modal-close:hover {
  background: #F1F5F9;
  color: #0F172A;
}

.modal h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-heading);
  font-size: 1.1rem;
  color: #0F172A;
  margin-bottom: 1.25rem;
}

.modal h3 svg {
  width: 20px;
  height: 20px;
  color: #6366F1;
}

/* 帮助步骤 */
.help-steps {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.help-step {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.step-number {
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, #6366F1, #818CF8);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.step-text {
  font-size: 0.875rem;
  color: #475569;
  line-height: 1.5;
  padding-top: 2px;
}

.modal-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.15);
  border-radius: 10px;
  font-size: 0.8rem;
  color: #92400E;
  margin-bottom: 1.5rem;
}

.modal-notice svg {
  flex-shrink: 0;
  margin-top: 1px;
}

.modal-btns {
  display: flex;
  justify-content: flex-end;
}

.btn-confirm {
  padding: 0.625rem 1.5rem;
  background: linear-gradient(135deg, #6366F1, #4F46E5);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-confirm:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

/* ===== 响应式 ===== */
@media (max-width: 1024px) {
  .login-page {
    flex-direction: column;
  }

  .login-brand {
    padding: 2.5rem 2rem;
    min-height: 320px;
  }

  .brand-title {
    font-size: 1.75rem;
  }

  .brand-stats {
    gap: 1.5rem;
  }

  .stat-number {
    font-size: 1.75rem;
  }

  .login-form-section {
    padding: 2rem 1.5rem;
  }
}

@media (max-width: 640px) {
  .login-brand {
    min-height: 260px;
    padding: 2rem 1.5rem;
  }

  .brand-title {
    font-size: 1.5rem;
  }

  .brand-subtitle {
    font-size: 0.85rem;
  }

  .brand-desc {
    display: none;
  }

  .brand-stats {
    gap: 1rem;
  }

  .stat-number {
    font-size: 1.5rem;
  }

  .stat-desc {
    font-size: 0.7rem;
  }

  .feature-tags {
    display: none;
  }

  .login-form-card {
    padding: 1.75rem;
  }

  .footer-links {
    gap: 0.3rem;
  }
}
</style>