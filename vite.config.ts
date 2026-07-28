import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const packageMetadata = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig(({ command, mode }) => {
  const desktopBuild = process.env.TOOLBOX_BUILD_TARGET === 'electron'
  // Declaration files are checked into the repository for type tooling.
  // Rewriting them during every production build can race with Windows
  // Defender/indexers and fail with EBUSY/UNKNOWN even though runtime output
  // is otherwise valid. Only the interactive Vite server refreshes them.
  const declarationOutput = command === 'serve'
  return {
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: tag => tag === 'webview',
          },
        },
      }),
      // 自动导入 Vue、Vue Router、Pinia 等 API
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia'],
        resolvers: [ElementPlusResolver()],
        dts: declarationOutput ? 'src/auto-imports.d.ts' : false,
      }),
      // 自动导入 Element Plus 组件
      Components({
        resolvers: [ElementPlusResolver()],
        dts: declarationOutput ? 'src/components.d.ts' : false,
      }),
      // Service Worker 只属于明确的 Web 构建，桌面壳使用自身更新与缓存策略。
      !desktopBuild && VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
        manifest: {
          name: '跨境电商赛训工具箱',
          short_name: '赛训工具箱',
          description: '亚马逊跨境电商赛训效率工具',
          theme_color: '#4F46E5',
          background_color: '#ffffff',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/api\./i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24, // 24 hours
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'image-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
          ],
        },
      }),
      // 构建分析（仅在分析模式时启用）
      mode === 'analyze' && visualizer({
        open: true,
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageMetadata.version),
    },
    base: './',
    server: {
      port: 3000,
      open: false  // 开发预览模式由 Electron 加载，不自动打开浏览器
    },
    // 预构建依赖，加速开发服务器启动
    optimizeDeps: {
      include: [
        'vue',
        'vue-router',
        'pinia',
      ],
      exclude: [
        // Sentry 体积大，不预构建
      ]
    },
    build: {
      // 代码分割策略
      rollupOptions: {
        output: {
          // 手动分割 chunk
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (/[\\/]node_modules[\\/](vue|vue-router|pinia)[\\/]/.test(id)) return 'vendor-vue'
            if (mode === 'production' && /[\\/]node_modules[\\/]@sentry[\\/]/.test(id)) return 'vendor-sentry'
            return undefined
          },
          // 减小 chunk 大小警告阈值
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        }
      },
      // 生产环境移除 console 和 debugger
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: mode === 'production',
          drop_debugger: true,
        }
      },
      // ExcelJS is an intentionally lazy-loaded spreadsheet chunk (~911 KB).
      // Entry and shared vendor chunks remain below 120 KB.
      chunkSizeWarningLimit: 1000,
      // CSS 代码分离
      cssCodeSplit: true,
      // PurgeCSS keeps the global design-token set; esbuild then safely
      // minifies the declarations without cross-chunk variable pruning.
      cssMinify: 'esbuild',
      // 生成 sourcemap（仅开发环境）
      sourcemap: mode !== 'production',
    },
  }
})
