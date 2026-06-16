/**
 * 构建验证脚本
 * 检查打包产物中是否包含正确的 API 地址
 */
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist', 'assets', 'js')
const files = readdirSync(distDir)
let found = false

for (const file of files) {
  if (!file.endsWith('.js')) continue
  const content = readFileSync(join(distDir, file), 'utf8')
  if (content.includes('8.130.113.104')) {
    found = true
    console.log(`✅ API 地址已找到: ${file}`)
    break
  }
}

if (!found) {
  console.error('❌ API 地址未找到！请检查 .env.production 和 vite.config.js')
  process.exit(1)
}

console.log('✅ 构建验证通过')