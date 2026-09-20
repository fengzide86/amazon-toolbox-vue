import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertMarketingMetadata, assertPagesProject, installerFromManifest, marketingToolEnvironment, publicHttpsUrl, readMarketingEnvironment, validateMarketingConfig } from '../marketing-config.mjs'

test('marketing config requires explicit HTTPS public origin and valid Pages identity', () => {
  const valid = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_PAGES_PROJECT: 'kesaitong', KST_MARKETING_SITE_URL: 'https://kesaitong.pages.dev/' }
  assert.equal(validateMarketingConfig(valid).publicUrl, 'https://kesaitong.pages.dev')
  for (const bad of ['http://kst.test', 'https://user:secret@kst.test', 'https://localhost', 'https://kst.test/?token=abc', 'https://kst.test/subpath']) {
    assert.throws(() => validateMarketingConfig({ ...valid, KST_MARKETING_SITE_URL: bad }))
  }
  assert.throws(() => validateMarketingConfig({ ...valid, CLOUDFLARE_ACCOUNT_ID: '' }))
  assert.throws(() => validateMarketingConfig({ ...valid, CLOUDFLARE_PAGES_PROJECT: 'unsafe;project' }))
  assert.throws(() => publicHttpsUrl('https://kst.test/#token', 'url'))
})

test('only allowlisted marketing settings are loaded and process values win', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kst-marketing-config-'))
  try {
    fs.writeFileSync(path.join(directory, '.env.marketing.local'), '# local\nKST_MARKETING_SITE_URL="https://kst.test"\nCLOUDFLARE_PAGES_PROJECT=kst-site\nCLOUDFLARE_API_TOKEN=never-load\nVITE_CONTROL_API_BASE=https://wrong.test\n')
    assert.deepEqual(readMarketingEnvironment(directory, { CLOUDFLARE_PAGES_PROJECT: 'override' }), { KST_MARKETING_SITE_URL: 'https://kst.test', CLOUDFLARE_PAGES_PROJECT: 'override' })
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('installer discovery rejects unpublished versions and external/path-traversal files', () => {
  assert.equal(installerFromManifest('version: 1.8.8\npath: KST Setup 1.8.8.exe\n', 'https://api.kst.test', '1.8.8'), 'https://api.kst.test/updates/KST%20Setup%201.8.8.exe')
  assert.throws(() => installerFromManifest('version: 1.8.7\npath: KST Setup 1.8.7.exe', 'https://api.kst.test', '1.8.8'))
  for (const filename of ['../evil.exe', 'https://evil.test/a.exe', 'folder/a.exe', 'folder\\a.exe', 'file.zip', 'file.exe?token=a']) {
    assert.throws(() => installerFromManifest(`version: 1.8.8\npath: ${filename}`, 'https://api.kst.test', '1.8.8'))
  }
})

test('post-deploy contract includes commit and correct installer, not only product version', () => {
  const expected = { version: '1.8.8', commitSha: 'abc', publicUrl: 'https://kst.test', downloadUrl: 'https://api.kst.test/a.exe' }
  assertMarketingMetadata(expected, expected)
  for (const field of Object.keys(expected)) assert.throws(() => assertMarketingMetadata({ ...expected, [field]: 'stale' }, expected))
})

test('CLI data is outside source and telemetry disabled', () => {
  const root = path.join(os.tmpdir(), 'kst-test-data')
  const env = marketingToolEnvironment({ TOOLBOX_DATA_ROOT: root })
  assert.equal(env.WRANGLER_SEND_METRICS, 'false')
  assert.equal(env.XDG_CONFIG_HOME, path.join(root, 'cloudflare', 'config'))
})

test('Pages project check uses the pinned Wrangler CLI JSON format', () => {
  assertPagesProject([{ 'Project Name': 'kesaitong', 'Project Domains': 'kesaitong.pages.dev, kesaitong.top' }], 'kesaitong', 'https://kesaitong.pages.dev')
  assertPagesProject([{ 'Project Name': 'kesaitong', 'Project Domains': 'kesaitong.pages.dev, kesaitong.top' }], 'kesaitong', 'https://kesaitong.top')
  assert.throws(() => assertPagesProject([], 'kesaitong', 'https://kesaitong.pages.dev'))
  assert.throws(() => assertPagesProject([{ 'Project Name': 'another-project' }], 'kesaitong', 'https://kesaitong.pages.dev'))
  assert.throws(() => assertPagesProject({ error: 'not logged in' }, 'kesaitong', 'https://kesaitong.pages.dev'))
  assert.throws(() => assertPagesProject([{ 'Project Name': 'kesaitong', 'Project Domains': 'kesaitong.pages.dev' }], 'kesaitong', 'https://unbound.example.test'))
})
