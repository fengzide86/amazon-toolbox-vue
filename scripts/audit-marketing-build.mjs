import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const directory = path.resolve(process.env.TOOLBOX_MARKETING_DIR || 'dist-marketing')
const required = ['index.html', '404.html', '_headers', '_redirects', 'marketing-version.json', 'robots.txt']
const allowedRoot = new Set([...required, 'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'pwa-512x512.png'])
const files = []
function inspect(relative = '') {
  for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
    const file = path.posix.join(relative, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Marketing artifact cannot contain symlinks: ${file}`)
    if (entry.isDirectory()) inspect(file)
    else files.push(file)
  }
}
inspect()
for (const name of required) if (!files.includes(name)) throw new Error(`Marketing artifact is missing ${name}`)
for (const name of files) {
  if (!allowedRoot.has(name) && !/^assets\/[\w.-]+-[\w-]{8,}\.(?:js|css|svg|png|webp|woff2?)$/i.test(name)) {
    throw new Error(`Unexpected marketing artifact (application/source/secret/map files are forbidden): ${name}`)
  }
  if (/\.(?:js|css|html|json|svg|txt)$/.test(name)) {
    const source = fs.readFileSync(path.join(directory, name), 'utf8')
    if (/\/api\/|app:\/\/toolbox|toolbox_token|user-credential\.bin|sourceMappingURL|-----BEGIN [^-]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9_]{20,}/.test(source)) {
      throw new Error(`Business API, application credential, secret or source map found in ${name}`)
    }
  }
}
const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'marketing-version.json'), 'utf8'))
if (metadata.kind !== 'kst-marketing' || metadata.sourcePolicy !== 'marketing-only-v1'
  || !/^[a-f0-9]{40}$/i.test(metadata.commitSha) || !metadata.version
  || !Number.isFinite(Date.parse(metadata.builtAt))) throw new Error('Marketing provenance is incomplete')
for (const key of ['publicUrl', 'downloadUrl']) {
  const url = new URL(metadata[key])
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || /candidate-|win-unpacked|localhost|127\.0\.0\.1/.test(metadata[key])) {
    throw new Error(`Invalid public marketing ${key}`)
  }
}
const headers = fs.readFileSync(path.join(directory, '_headers'), 'utf8')
if (!headers.includes("connect-src 'none'") || !headers.includes('immutable') || !headers.includes('/marketing-version.json\n  Cache-Control: no-store')) {
  throw new Error('Marketing response policy is incomplete')
}
const redirects = fs.readFileSync(path.join(directory, '_redirects'), 'utf8')
if (!redirects.includes('/terms /index.html 200') || redirects.includes('/* /index.html')) {
  throw new Error('Marketing must retain true 404s instead of a blanket SPA rewrite')
}
console.log(`marketing_artifact=verified files=${files.length} business_api=0 source_maps=0`)
console.log(`marketing_commit=${metadata.commitSha}`)
