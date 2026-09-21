import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { matchesUpgradeFixture, readPinnedUpgradeFixture } from '../../../scripts/prepare-nsis-upgrade.mjs'

const scratchParent = resolve(process.platform === 'win32' ? 'D:/AmazonToolboxData/installer-smoke' : tmpdir())
const scratchDirectories: string[] = []
const syntheticBytes = Buffer.from('isolated fixture bytes, never an executable')

function scratch() {
  mkdirSync(scratchParent, { recursive: true })
  const directory = mkdtempSync(join(scratchParent, 'kst-upgrade-fixture-test-'))
  scratchDirectories.push(directory)
  return directory
}

function syntheticFixture(version: string, bytes = syntheticBytes) {
  const fileName = `KST Setup ${version}.exe`
  return { version, fileName, url: `https://8.130.113.104/updates/${encodeURIComponent(fileName)}`,
    size: bytes.length, sha512: createHash('sha512').update(bytes).digest('hex') }
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) {
    const target = resolve(directory)
    if (!target.startsWith(scratchParent + sep) || !basename(target).startsWith('kst-upgrade-fixture-test-')) {
      throw new Error('Refusing to clean an unowned fixture directory')
    }
    rmSync(target, { recursive: true, force: true })
  }
})

describe('immutable released NSIS upgrade baselines', () => {
  it('keeps the original 1.8.5 baseline as the default with its reviewed bytes', async () => {
    expect(await readPinnedUpgradeFixture()).toMatchObject({
      version: '1.8.5', size: 110350703,
      sha512: 'b6d6e56a2e2a363f55a2d802221e90c351d02e4d75926cbc87893fcaf7976c76ae4b7c095a0a304b861385bbbd8b099256bee2b93517180af0c94574088ade37',
    })
  })

  it('selects the separately pinned 1.8.7 published installer rather than the current candidate', async () => {
    expect(await readPinnedUpgradeFixture('1.8.7')).toEqual({
      version: '1.8.7', fileName: 'KST Setup 1.8.7.exe',
      url: 'https://8.130.113.104/updates/KST%20Setup%201.8.7.exe', size: 110500040,
      sha512: '384b7243c99fbc4cce0c3917b1bea2f2538f57cc134aa714216295e0745405786746d9093ddc489b9374bf89416dd952d2ff06cc66d594d430df1ed1fc8e8fc2',
    })
  })

  it('pins the live 1.8.8 release bytes for the next candidate upgrade', async () => {
    expect(await readPinnedUpgradeFixture('1.8.8')).toEqual({
      version: '1.8.8', fileName: 'KST Setup 1.8.8.exe',
      url: 'https://8.130.113.104/updates/KST%20Setup%201.8.8.exe', size: 110558995,
      sha512: 'a648f5b19e3d2f68e1db068b46578219b63761e629a2cc43999ea140f973c2536826ea5a4fd4f5a32581a7abbcd24272404fa11c636536632724aec6fea66afd',
    })
  })

  it.each(['latest', '1.8.9', '../1.8.8', 'toString', '__proto__'])('rejects unreviewed or unsafe baseline %s', async version => {
    await expect(readPinnedUpgradeFixture(version)).rejects.toThrow('Unsupported pinned NSIS baseline')
  })

  it('checks both exact length and SHA512 before accepting cached bytes', async () => {
    const file = join(scratch(), 'fixture.exe')
    const fixture = syntheticFixture('1.8.7')
    expect(await matchesUpgradeFixture(file, fixture)).toBe(false)
    writeFileSync(file, syntheticBytes)
    expect(await matchesUpgradeFixture(file, fixture)).toBe(true)
    writeFileSync(file, Buffer.alloc(syntheticBytes.length, 33))
    expect(await matchesUpgradeFixture(file, fixture)).toBe(false)
    writeFileSync(file, Buffer.concat([syntheticBytes, Buffer.from('extra')]))
    expect(await matchesUpgradeFixture(file, fixture)).toBe(false)
  })

  // The installer-preparation CLI intentionally accepts only a D: destination.
  // Linux CI still runs every metadata/hash test above; Windows also exercises
  // the real CLI cache path without downloading or executing any binary.
  it.skipIf(process.platform !== 'win32').each(['1.8.5', '1.8.7', '1.8.8'])('exports the correct cached %s baseline to subsequent CI steps', version => {
    const root = scratch()
    const script = join(root, 'prepare-nsis-upgrade.mjs')
    copyFileSync(resolve('scripts/prepare-nsis-upgrade.mjs'), script)
    const fixtures = [['1.8.5', 'nsis-upgrade-fixture.json'], ['1.8.7', 'nsis-upgrade-fixture-1.8.7.json'], ['1.8.8', 'nsis-upgrade-fixture-1.8.8.json']]
    for (const [fixtureVersion, file] of fixtures) writeFileSync(join(root, file), JSON.stringify(syntheticFixture(fixtureVersion)))
    const cache = join(root, 'cache')
    mkdirSync(cache)
    const installer = join(cache, `KST Setup ${version}.exe`)
    writeFileSync(installer, syntheticBytes)
    const githubEnv = join(root, 'github.env')
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, NSIS_BASELINE_VERSION: version, NSIS_FIXTURE_DIR: cache, GITHUB_ENV: githubEnv },
      encoding: 'utf8', timeout: 5000,
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`nsis_previous_version=${version}`)
    expect(result.stdout).toContain('nsis_previous_sha512=verified')
    expect(readFileSync(githubEnv, 'utf8')).toBe(`NSIS_PREVIOUS_INSTALLER=${installer}\nNSIS_PREVIOUS_VERSION=${version}\n`)
    expect(readFileSync(installer)).toEqual(syntheticBytes)
  })

  it.skipIf(process.platform !== 'win32')('preserves unexpected cached bytes and refuses to export a validated baseline', () => {
    const root = scratch()
    const script = join(root, 'prepare-nsis-upgrade.mjs')
    copyFileSync(resolve('scripts/prepare-nsis-upgrade.mjs'), script)
    writeFileSync(join(root, 'nsis-upgrade-fixture-1.8.7.json'), JSON.stringify(syntheticFixture('1.8.7')))
    const cache = join(root, 'cache')
    mkdirSync(cache)
    const installer = join(cache, 'KST Setup 1.8.7.exe')
    const unexpected = Buffer.alloc(syntheticBytes.length, 33)
    writeFileSync(installer, unexpected)
    const githubEnv = join(root, 'github.env')
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, NSIS_BASELINE_VERSION: '1.8.7', NSIS_FIXTURE_DIR: cache, GITHUB_ENV: githubEnv },
      encoding: 'utf8', timeout: 5000,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Cached old installer has unexpected bytes')
    expect(readFileSync(installer)).toEqual(unexpected)
    expect(existsSync(githubEnv)).toBe(false)
  })
})
