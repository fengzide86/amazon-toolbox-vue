import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const scratchDirectories: string[] = []
const checker = resolve('scripts/check-source-artifacts.mjs')

function fixture(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'kst-source-artifacts-'))
  scratchDirectories.push(root)
  for (const file of files) {
    const target = join(root, file)
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, '')
  }
  return root
}

afterEach(() => {
  for (const root of scratchDirectories.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('source artifact gate', () => {
  it('rejects emitted source/config siblings that would shadow current code', () => {
    const root = fixture(['src/router/index.ts', 'src/router/index.js', 'electron/main.cts', 'electron/main.cjs', 'vite.config.ts', 'vite.config.js'])
    const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('src/router/index.js')
    expect(result.stderr).toContain('electron/main.cjs')
    expect(result.stderr).toContain('vite.config.js')
  })

  it('allows real source scripts and output in the build directory', () => {
    const root = fixture(['src/main.ts', 'src/env.d.ts', 'src/env.d.js', 'scripts/task.mjs', 'dist-electron/electron/main.cjs'])
    const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('shadowed_sources=0')
  })
})
