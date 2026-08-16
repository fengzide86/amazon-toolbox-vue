import purgecss from '@fullhuman/postcss-purgecss'
import autoprefixer from 'autoprefixer'

export default {
  plugins: [
    // 自动添加浏览器前缀
    autoprefixer(),
    // 仅在构建时启用 PurgeCSS
    process.env.NODE_ENV === 'production' && purgecss({
      content: [
        './src/**/*.vue',
        './src/**/*.ts',
        './src/**/*.jsx',
        './index.html',
      ],
      defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || [],
      safelist: {
        standard: [
          // 保留 Element Plus 动态类名
          /^el-/,
          /^is-/,
          // 保留动画类
          /^fade-/,
          /^slide-/,
          /^zoom-/,
          /^collapse-/,
          /^page-/,
          // 保留自定义工具类
          /^text-/,
          /^bg-/,
          /^border-/,
          /^flex-/,
          /^grid-/,
          // 保留状态类
          'active',
          'disabled',
          'loading',
          'success',
          'warning',
          'error',
          'info',
        ],
        deep: [
          // Element Plus 组件内部类
          /el-.*/,
          /is-.*/,
        ],
        greedy: [
          // 保留所有 CSS 变量
          /--.*/,
        ],
      },
      // 保留关键 CSS。全局设计令牌可能只在懒加载组件的独立 CSS
      // chunk 中使用，不能按入口样式表的使用情况删除。
      fontFace: true,
      keyframes: true,
      variables: false,
    }),
  ].filter(Boolean),
}
