import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const verifier = resolve('scripts/verify-nsis-artifacts.mjs')
const directories: string[] = []
function fixture() {
  const temporaryRoot = process.platform === 'win32' ? 'D:/AmazonToolboxData/installer-smoke' : tmpdir()
  mkdirSync(temporaryRoot, { recursive: true })
  const root = mkdtempSync(join(temporaryRoot, 'kst-artifact-test-'))
  directories.push(root)
  mkdirSync(join(root, 'release'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.8.8' }))
  const bytes = Buffer.from('synthetic installer bytes, never executable')
  const hash = createHash('sha512').update(bytes).digest('base64')
  writeFileSync(join(root, 'release', 'KST Setup 1.8.8.exe'), bytes)
  writeFileSync(join(root, 'release', 'KST Setup 1.8.8.exe.blockmap'), 'fixture blockmap')
  const manifest = join(root, 'release/latest.yml')
  writeFileSync(manifest, `version: 1.8.8\nfiles:\n  - url: KST Setup 1.8.8.exe\n    sha512: ${hash}\n    size: ${bytes.length}\npath: KST Setup 1.8.8.exe\nsha512: ${hash}\n`)
  return { root, manifest }
}
function verify(root: string) {
  return execFileSync(process.execPath, [verifier], { cwd: root, encoding: 'utf8', stdio: 'pipe' })
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('NSIS update artifact identity', () => {
  it('accepts consistent bytes, version, size and file name', () => {
    expect(verify(fixture().root)).toContain('nsis_sha512=verified')
  })
  it('rejects a modified installer despite an unchanged manifest', () => {
    const { root } = fixture()
    writeFileSync(join(root, 'release/KST Setup 1.8.8.exe'), 'changed bytes')
    expect(() => verify(root)).toThrow(/SHA512 does not match/)
  })
  it('rejects a manifest path escape', () => {
    const { root, manifest } = fixture()
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('path: KST Setup', 'path: ../KST Setup'))
    expect(() => verify(root)).toThrow(/file name, not a path/)
  })
  it('rejects a files entry which disagrees with top-level metadata', () => {
    const { root, manifest } = fixture()
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(/size: \d+/, 'size: 1'))
    expect(() => verify(root)).toThrow(/files entry disagrees/)
  })
})
