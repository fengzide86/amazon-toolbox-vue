import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import '@/assets/css/main.css'
import { initSentry } from './utils/sentry'

// 每次启动应用时清除登录状态，强制重新登录
localStorage.removeItem('toolbox_auth')
localStorage.removeItem('toolbox_role')
localStorage.removeItem('toolbox_login_time')
// 清除 token（配合 Pinia 使用）
localStorage.removeItem('toolbox_token')
localStorage.removeItem('toolbox_user')

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// 初始化 Sentry 错误监控（生产环境自动启用）
initSentry(app, router)

app.mount('#app')
