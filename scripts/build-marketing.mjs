/* global fetch, AbortSignal */
import path from 'node:path'
import process from 'node:process'
import console from 'node:console'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { installerFromManifest, readMarketingEnvironment } from './marketing-config.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const environment = { ...process.env, ...readMarketingEnvironment(root) }
if (!environment.VITE_DESKTOP_DOWNLOAD_URL) {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const response = await fetch(`${metadata.toolbox.controlApiUrl}/updates/latest.yml`, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`无法取得当前正式下载清单：HTTP ${response.status}`)
  const manifest = await response.text()
  const version = /^version:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/m.exec(manifest)?.[1]
  if (!version) throw new Error('正式下载清单版本无效')
  environment.VITE_DESKTOP_DOWNLOAD_URL = installerFromManifest(manifest, metadata.toolbox.controlApiUrl, version)
  console.log(`本地官网构建使用已发布安装包 ${version}；正式发布仍核对源码版本与线上版本一致。`)
}
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.marketing.config.ts', '--mode', 'production'], {
  cwd: root, env: environment, stdio: 'inherit', windowsHide: true,
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
