<template>
  <main class="login-container">
    <div class="login-card">
      <div class="logo-section">
        <div class="logo-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <h1>亚马逊赛训效率工具箱</h1>
        <p>请输入授权码激活您的工具箱</p>
      </div>

      <div class="error-message" :class="{ show: showError }">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span>{{ errorMessage }}</span>
      </div>

      <div class="success-message" :class="{ show: showSuccess }">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
        <span>授权成功！正在跳转到首页...</span>
      </div>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="authCode">授权码</label>
          <div class="input-wrapper">
            <span class="input-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
              </svg>
            </span>
            <input
              type="text"
              id="authCode"
              v-model="authCode"
              placeholder="请输入您的授权码（如：XXXX-XXXX-XXXX）"
              autocomplete="off"
              required
            >
          </div>
        </div>

        <div class="device-info">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <span>已检测到设备：<strong>{{ deviceName }}</strong>（Windows 11）</span>
        </div>

        <button type="submit" class="btn-login" :disabled="isLoading" :aria-busy="isLoading">
          <svg v-if="!isLoading" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
          </svg>
          <svg v-else class="spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          {{ isLoading ? '验证中...' : '验证并登录' }}
        </button>
      </form>

      <nav class="footer-links" aria-label="其他操作">
        <a href="#" @click.prevent="showHelp" aria-label="查看使用帮助" class="footer-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          使用帮助
        </a>
        <span class="footer-divider"></span>
        <a href="#" @click.prevent="showContact" aria-label="联系客服" class="footer-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
          联系客服
        </a>
        <span class="footer-divider"></span>
        <a href="#/user/terms" class="footer-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          服务条款
        </a>
        <span class="footer-divider"></span>
        <a href="#/admin/login" class="footer-link admin-link" aria-label="管理员登录">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          管理员登录
        </a>
      </nav>
    </div>

    <!-- 帮助弹窗 -->
    <div class="modal-overlay" :class="{ show: showHelpModal }" @click.self="closeModals">
      <div class="modal">
        <button class="modal-close" @click="closeModals" aria-label="关闭">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <h3>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          如何使用
        </h3>
        <p>1. 购买套餐后，您会收到一个授权码<br>2. 在此页面输入授权码进行激活<br>3. 系统会自动绑定您的Windows设备<br>4. 激活成功后即可使用所有工具箱功能<br><br>注意: 每个授权码只能绑定一台设备，如需更换设备请联系客服。</p>
        <div class="modal-btns">
          <button class="btn-confirm" @click="closeModals">我知道了</button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Auth, showToast, getDeviceId, getDeviceName } from '@/utils'
import { verifyAuthCode, getSettings } from '@/utils/api'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const authCode = ref('')
const isLoading = ref(false)
const showError = ref(false)
const showSuccess = ref(false)
const showHelpModal = ref(false)
const errorMessage = ref('')

const deviceName = ref('')
const deviceId = ref('')
const wechatId = ref('AmazonToolbox_Support') // 默认值

// 获取客服微信
async function loadWechatId() {
  try {
    const settings = await getSettings()
    const wxSetting = settings.find(s => s.key === 'wechat_id')
    if (wxSetting && wxSetting.value) {
      wechatId.value = wxSetting.value
    }
  } catch (e) {
    // 使用默认值
  }
}

// 授权码格式验证
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
        // 使用 Pinia store 管理登录状态
        userStore.setLogin({
          token: res.data.token,
          role: 'user',
          auth_code: authCode.value.trim(),
          user: res.data,
        })
        userStore.setDevice(deviceId.value, deviceName.value)
        
        // 保持 Auth 工具类的兼容性
        Auth.set(authCode.value.trim())
        
        showSuccess.value = true
        showToast('授权成功！正在跳转...', 'success')
        setTimeout(() => {
          router.push('/user/dashboard')
        }, 1200)
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
      showToast('网络连接失败', 'error')
      isLoading.value = false
    })
}

function showHelp() {
  showHelpModal.value = true
}

function showContact() {
  showToast('客服微信：' + wechatId.value, 'info')
}

function showTerms() {
  showToast('服务条款页面开发中', 'info')
}

function closeModals() {
  showHelpModal.value = false
}

function handleEscKey(e) {
  if (e.key === 'Escape') closeModals()
}

onMounted(() => {
  deviceName.value = getDeviceName()
  deviceId.value = getDeviceId()
  document.addEventListener('keydown', handleEscKey)
  loadWechatId()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscKey)
})
</script>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  width: 100%;
  max-width: 480px;
  padding: 2rem;
  margin: 0 auto;
}

.login-card {
  background: white;
  border-radius: 24px;
  padding: 3rem 2.5rem;
  box-shadow: 0 25px 50px rgba(15,23,42,0.1), 0 0 0 1px rgba(226,232,240,0.5);
  width: 100%;
}

.logo-section {
  text-align: center;
  margin-bottom: 2.5rem;
}

.logo-section .logo-icon {
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-light));
  border-radius: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  box-shadow: 0 10px 25px rgba(99,102,241,0.3);
}

.logo-section .logo-icon svg {
  width: 32px;
  height: 32px;
  color: white;
}

.logo-section h1 {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 0.5rem;
}

.logo-section p {
  color: var(--color-muted);
  font-size: 0.9rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 0.5rem;
}

.input-wrapper {
  position: relative;
}

.input-wrapper input {
  width: 100%;
  padding: 1rem 1rem 1rem 3rem;
  background: #F8FAFC;
  border: 2px solid var(--color-border);
  border-radius: 12px;
  color: var(--color-foreground);
  font-size: 1rem;
  font-family: var(--font-family);
  transition: all var(--transition);
  outline: none;
}

.input-wrapper input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 4px rgba(99,102,241,0.1);
  background: white;
}

.input-icon {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-muted);
}

.input-icon svg {
  width: 20px;
  height: 20px;
}

.device-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(129,140,248,0.08));
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 12px;
  margin-bottom: 1.5rem;
  font-size: 0.85rem;
  color: var(--color-muted);
}

.device-info svg {
  width: 20px;
  height: 20px;
  color: var(--color-accent);
  flex-shrink: 0;
}

.btn-login {
  width: 100%;
  min-height: 48px;
  padding: 1rem;
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-light));
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  font-family: var(--font-heading);
  cursor: pointer;
  transition: all 0.2s ease-out;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.btn-login:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 15px 30px rgba(99,102,241,0.3);
}

.btn-login:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 5px 15px rgba(99,102,241,0.2);
}

.btn-login:focus-visible {
  outline: 3px solid rgba(99,102,241,0.4);
  outline-offset: 2px;
}

.btn-login:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.spinner {
  animation: spin 1s linear infinite;
  width: 20px;
  height: 20px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
  .btn-login {
    transition: none;
  }
}

.btn-login svg {
  width: 20px;
  height: 20px;
}

.error-message {
  display: none;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(220,38,38,0.08);
  border: 1px solid rgba(220,38,38,0.2);
  border-radius: 10px;
  margin-bottom: 1.5rem;
  font-size: 0.85rem;
  color: var(--color-destructive);
}

.error-message.show {
  display: flex;
}

.error-message svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.success-message {
  display: none;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(99,102,241,0.08);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 10px;
  margin-bottom: 1.5rem;
  font-size: 0.85rem;
  color: var(--color-accent);
}

.success-message.show {
  display: flex;
}

.footer-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-border);
  flex-wrap: wrap;
}

.footer-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--color-muted);
  text-decoration: none;
  transition: all 0.2s ease-out;
  white-space: nowrap;
}

.footer-link:hover {
  background: rgba(99, 102, 241, 0.08);
  color: var(--color-accent);
}

.footer-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.footer-link svg {
  flex-shrink: 0;
  opacity: 0.7;
}

.footer-link:hover svg {
  opacity: 1;
}

.footer-divider {
  width: 1px;
  height: 12px;
  background: var(--color-border);
}

.admin-link {
  color: var(--color-accent) !important;
  font-weight: 600;
  background: rgba(99, 102, 241, 0.06);
}

.admin-link:hover {
  background: rgba(99, 102, 241, 0.12);
}

@media (max-width: 480px) {
  .footer-links {
    flex-direction: column;
    gap: 0.25rem;
  }
  .footer-divider {
    display: none;
  }
  .footer-link {
    width: 100%;
    justify-content: center;
  }
}

.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(15,23,42,0.5);
  backdrop-filter: blur(5px);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}

.modal-overlay.show {
  display: flex;
}

.modal {
  position: relative;
  background: white;
  border-radius: 20px;
  padding: 2rem;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 25px 50px rgba(0,0,0,0.15);
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
  cursor: pointer;
  color: var(--color-muted);
  transition: all 0.2s;
}

.modal-close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--color-primary);
}

.modal h3 {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: var(--color-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.modal p {
  color: var(--color-muted);
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1.5rem;
}

.modal-btns {
  display: flex;
  gap: 0.75rem;
}

.modal-btns button {
  flex: 1;
  padding: 0.75rem;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  font-family: var(--font-heading);
  cursor: pointer;
  transition: all var(--transition);
}

.btn-confirm {
  background: var(--color-accent);
  border: none;
  color: white;
}

.btn-confirm:hover {
  background: var(--color-accent-light);
}

@media (max-width: 480px) {
  .login-card {
    padding: 2rem 1.5rem;
  }
  .login-container {
    padding: 1rem;
  }
}
</style>