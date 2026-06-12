import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  // 加载环境变量：.env.development 或 .env.production
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    base: './',
    server: {
      port: 3000,
      open: true
    },
    // 将环境变量注入前端代码
    define: {
      'import.meta.env.VITE_API_BASE': JSON.stringify(env.VITE_API_BASE || 'http://8.130.113.104:8000'),
      'import.meta.env.VITE_ENV': JSON.stringify(env.VITE_ENV || 'production')
    }
  }
})
