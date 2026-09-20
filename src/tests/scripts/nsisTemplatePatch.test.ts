import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ORIGINAL_KNOWN_FOLDER_BLOCK, PATCHED_KNOWN_FOLDER_BLOCK, SAFE_POINTER_COPY, patchNsisTemplate } from '../../../scripts/prepare-nsis-template.mjs'
import { renderKnownFolderProbe } from '../../../scripts/test-nsis-known-folder-copy.mjs'

const installed = readFileSync(resolve('node_modules/app-builder-lib/templates/nsis/multiUser.nsh'), 'utf8').replaceAll('\r\n', '\n')
const original = installed.replace(PATCHED_KNOWN_FOLDER_BLOCK, ORIGINAL_KNOWN_FOLDER_BLOCK)

describe('guarded NSIS known-folder memory fix', () => {
  it('patches only the reviewed block and is repeatable after npm ci', () => {
    const patched = patchNsisTemplate(original, '26.8.1')
    expect(patched.changed).toBe(true)
    expect(patched.source.replace(PATCHED_KNOWN_FOLDER_BLOCK, ORIGINAL_KNOWN_FOLDER_BLOCK)).toBe(original)
    expect(patched.source).not.toMatch(/^\s*System::Store\s/m)
    expect(patched.source).not.toContain('*$2(&w${NSIS_MAX_STRLEN}')
    expect(patched.source).toContain(SAFE_POINTER_COPY)
    expect(patchNsisTemplate(patched.source, '26.8.1')).toEqual({ source: patched.source, changed: false })
  })

  it('keeps original CRLF or LF without broad dependency rewrites', () => {
    const crlf = original.replaceAll('\n', '\r\n')
    const result = patchNsisTemplate(crlf, '26.8.1')
    expect(result.source.replaceAll('\r\n', '\n')).toBe(patchNsisTemplate(original, '26.8.1').source)
    expect(result.source.replaceAll('\r\n', '')).not.toContain('\n')
  })

  it('fails closed on dependency upgrades, drift, partial patches, or duplicate blocks', () => {
    expect(() => patchNsisTemplate(original, '26.9.0')).toThrow('only supports')
    expect(() => patchNsisTemplate(original + '\n# unreviewed', '26.8.1')).toThrow('Unrecognized')
    expect(() => patchNsisTemplate(original.replace('System::Store S', 'Push $1'), '26.8.1')).toThrow('Unrecognized')
    expect(() => patchNsisTemplate(original + ORIGINAL_KNOWN_FOLDER_BLOCK, '26.8.1')).toThrow('Unrecognized')
    const patched = patchNsisTemplate(original, '26.8.1').source
    expect(() => patchNsisTemplate(patched + '\n# unreviewed', '26.8.1')).toThrow('differs')
    expect(() => patchNsisTemplate(patched + PATCHED_KNOWN_FOLDER_BLOCK, '26.8.1')).toThrow('Unrecognized')
  })

  it('does not alter registry recognition, scope, app identity, or /D handling', () => {
    const patched = patchNsisTemplate(original, '26.8.1').source
    const before = original.split(ORIGINAL_KNOWN_FOLDER_BLOCK)
    const after = patched.split(PATCHED_KNOWN_FOLDER_BLOCK)
    expect(after).toEqual(before)
    expect(patched).toContain('ReadRegStr $perUserInstallationFolder HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation')
    expect(patched).toContain('SetShellVarContext current')
    expect(patched).toContain('!insertmacro GetDParameter $R0')
  })

  it('uses the same copy and production block in a non-installing guard-page probe', () => {
    const probe = renderKnownFolderProbe('D:\\isolated\\probe.exe')
    expect(probe.split(PATCHED_KNOWN_FOLDER_BLOCK)).toHaveLength(3)
    expect(probe).toContain('VirtualProtect(p r7, p 4096, i 1, *i .r8)')
    expect(probe).toContain('RequestExecutionLevel user')
    expect(probe).toContain('!define KF_FLAG_CREATE 0')
    expect(probe).not.toMatch(/WriteReg|CreateShortCut|WriteUninstaller|FileOpen|SetOutPath/)
    expect(() => renderKnownFolderProbe('D:\\bad$path\\probe.exe')).toThrow('Unsafe')
  })

  it('all documented NSIS packaging entry points prepare the reviewed template', () => {
    const metadata = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    expect(metadata.scripts['desktop:prepare-nsis']).toBe('node scripts/prepare-nsis-template.mjs')
    for (const command of ['electron:build', 'electron:release']) {
      expect(metadata.scripts[command]).toContain('npm run desktop:prepare-nsis &&')
      expect(metadata.scripts[command].indexOf('desktop:prepare-nsis')).toBeLessThan(metadata.scripts[command].indexOf('electron-builder --win nsis'))
    }
    expect(metadata.build.appId).toBe('com.amazon.toolbox')
    expect(metadata.build.nsis.perMachine).toBeUndefined()
  })
})
