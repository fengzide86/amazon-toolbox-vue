/**
 * Vitest 独立配置文件
 * 用于前端单元测试和组件测试
 * 
 * 运行测试: npx vitest
 * 运行测试(单次): npx vitest run
 * 生成覆盖率: npx vitest run --coverage
 */
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/tests/setup.js'],
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: [
      'node_modules/**',
      'dist-release/**',
      'release/**',
      'amazon-toolbox/**',
      'backend/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{js,vue}'],
      exclude: ['src/tests/**', 'src/main.js']
    }
  }
})