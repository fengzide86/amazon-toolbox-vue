<template>
  <main class="login-container">
    <div class="login-card">
      <div class="logo-section">
        <div class="logo-icon" style="background: linear-gradient(135deg, #0EA5E9, #0284C7);">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
        </div>
        <h1>管理员登录</h1>
        <p>请输入管理员密码进入后台</p>
      </div>

      <div class="error-message" :class="{ show: showError }" role="alert">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span>{{ errorMessage }}</span>
      </div>

      <div class="success-message" :class="{ show: showSuccess }" role="status">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
        <span>登录成功！正在跳转到管理后台...</span>
      </div>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="adminPassword">管理员密码</label>
          <div class="input-wrapper">
            <span class="input-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </span>
            <input
              :type="showPassword ? 'text' : 'password'"
              id="adminPassword"
              v-model="password"
              placeholder="请输入管理员密码"
              autocomplete="current-password"
              required
            >
            <button type="button" class="toggle-password" @click="showPassword = !showPassword" :aria-label="showPassword ? '隐藏密码' : '显示密码'" :title="showPassword ? '隐藏密码' : '显示密码'">
              <svg v-if="!showPassword" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
            </button>
          </div>
        </div>

        <button type="submit" class="btn-login" :disabled="isLoading" :aria-busy="isLoading" style="background: linear-gradient(135deg, #0EA5E9, #0284C7);">
          <svg v-if="isLoading" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          {{ isLoading ? '验证中...' : '登录管理后台' }}
        </button>
      </form>

      <nav class="footer-links" aria-label="其他操作">
        <a href="#" @click.prevent="goToUserLogin" aria-label="返回用户登录">← 返回用户登录</a>
      </nav>
    </div>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Auth, showToast } from '@/utils'
import { adminLogin } from '@/utils/api'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const password = ref('')
const showPassword = ref(false)
const isLoading = ref(false)
const showError = ref(false)
const showSuccess = ref(false)
const errorMessage = ref('')

function handleLogin() {
  showError.value = false
  showSuccess.value = false

  if (!password.value.trim()) {
    showToast('请输入密码', 'error')
    return
  }

  isLoading.value = true

  adminLogin(password.value.trim())
    .then((res) => {
      if (res.success) {
        // 使用 Pinia store 管理登录状态
        userStore.setLogin({
          token: res.data?.token,
          role: 'admin',
          auth_code: 'admin',
          user: res.data,
        })
        
        // 保持 Auth 工具类的兼容性
        Auth.set('admin')
        
        showSuccess.value = true
        showToast('登录成功！', 'success')
        // 触发窗口形变为管理员宽屏模式
        try {
          window.electronAPI?.resizeWindow('admin-large')
        } catch (e) {
          console.warn('resizeWindow failed:', e)
        }
        setTimeout(() => {
          router.push('/admin/dashboard')
        }, 1000)
      } else {
        errorMessage.value = res.message
        showError.value = true
        showToast(res.message, 'error')
        isLoading.value = false
      }
    })
    .catch((err) => {
      errorMessage.value = '无法连接到后端服务，请检查后端是否运行'
      showError.value = true
      showToast('连接失败', 'error')
      isLoading.value = false
    })
}

function goToUserLogin() {
  router.push('/user/login')
}
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
  border-radius: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  box-shadow: 0 10px 25px rgba(14,165,233,0.3);
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
  border-color: var(--studio-accent);
  box-shadow: 0 0 0 4px rgba(14,165,233,0.1);
  background: white;
}

.input-wrapper input:focus-visible {
  border-color: var(--studio-accent);
  box-shadow: 0 0 0 4px rgba(14,165,233,0.2);
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

.toggle-password {
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  padding: 0.5rem;
  min-width: 44px;
  min-height: 44px;
  cursor: pointer;
  color: var(--color-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease-out;
  border-radius: 6px;
}

.toggle-password:hover {
  color: var(--studio-accent);
}

.toggle-password:focus-visible {
  outline: 2px solid var(--studio-accent);
  outline-offset: 2px;
}

.toggle-password svg {
  width: 20px;
  height: 20px;
}

.btn-login {
  width: 100%;
  min-height: 48px;
  padding: 1rem;
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
  box-shadow: 0 15px 30px rgba(14,165,233,0.3);
}

.btn-login:active:not(:disabled) {
  transform: translateY(0);
}

.btn-login:focus-visible {
  outline: 3px solid rgba(14,165,233,0.4);
  outline-offset: 2px;
}

.btn-login:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-spinner {
  animation: spin 1s linear infinite;
  width: 20px;
  height: 20px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
  background: rgba(14,165,233,0.08);
  border: 1px solid rgba(14,165,233,0.2);
  border-radius: 10px;
  margin-bottom: 1.5rem;
  font-size: 0.85rem;
  color: var(--studio-accent);
}

.success-message.show {
  display: flex;
}

.footer-links {
  text-align: center;
  margin-top: 2rem;
  display: flex;
  justify-content: center;
}

.footer-links a {
  color: var(--color-muted);
  text-decoration: none;
  font-size: 0.85rem;
  transition: color 0.2s ease-out;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
}

.footer-links a:hover {
  color: var(--studio-accent);
}

.footer-links a:focus-visible {
  outline: 2px solid var(--studio-accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .btn-spinner {
    animation: none;
  }
  .btn-login,
  .toggle-password,
  .footer-links a {
    transition: none;
  }
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