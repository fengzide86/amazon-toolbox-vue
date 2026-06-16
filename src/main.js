import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import '@/assets/css/main.css'
import { initSentry } from './utils/sentry'

// 不在启动时清除登录状态，由路由守卫和 token 过期机制管理登录态

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// 初始化 Sentry 错误监控（生产环境自动启用）
initSentry(app, router)

app.mount('#app')
