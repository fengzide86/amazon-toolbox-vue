import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const dist = path.join(root, 'dist')
const required = ['index.html', 'sw.js', 'manifest.webmanifest', 'web-version.json']
for (const filename of required) {
  if (!fs.statSync(path.join(dist, filename), { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Web build is missing ${filename}`)
  }
}

const serviceWorker = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8')
const urls = [...serviceWorker.matchAll(/url:\s*["']([^"']+)["']/g)].map(match => match[1])
const hashedStatic = /^assets\/(?:.+\/)?[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|svg)$/i
const invalid = urls.filter(url => !hashedStatic.test(url))
if (!urls.length || invalid.length) {
  throw new Error(`Service worker precache must contain only hashed static assets: ${invalid.join(', ') || 'empty'}`)
}
if (!serviceWorker.includes('NetworkOnly') || !serviceWorker.includes('/api')) {
  throw new Error('Service worker must keep /api on NetworkOnly')
}

const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
if (!/rel=["']manifest["'][^>]+manifest\.webmanifest/i.test(index)) {
  throw new Error('Web build must link the installable manifest')
}

process.stdout.write(`web_build_policy=verified precache_entries=${urls.length}\n`)
