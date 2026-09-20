import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PATCHED_KNOWN_FOLDER_BLOCK, SAFE_POINTER_COPY } from './prepare-nsis-template.mjs'

// A memory/API probe, NOT an installer: no registry, shortcuts, application
// files, UAC elevation, or production network. Artifacts are retained on D:.
export function renderKnownFolderProbe(executable) {
  if (/["$\r\n]/.test(executable)) throw new Error('Unsafe NSIS probe output path')
  return String.raw`Unicode true
!include LogicLib.nsh
Name "KST NSIS pointer-copy probe"
OutFile "${executable}"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
!define FOLDERID_UserProgramFiles {5CD7AEE2-2219-4A67-B85D-6C9CE15660CB}
!define KF_FLAG_CREATE 0
Section
  # Suppress the Windows crash UI: any violation remains a failing exit code.
  System::Call 'KERNEL32::SetErrorMode(i 0x8003)i'
  # Put a six-WCHAR string at the last 12 bytes of a readable page. The next
  # page is PAGE_NOACCESS, so an NSIS_MAX_STRLEN fixed-array read is invalid.
  System::Call 'KERNEL32::VirtualAlloc(p 0, p 8192, i 0x3000, i 4)p.r6'
  StrCmp $6 0 failed
  IntOp $2 $6 + 4084
  System::Call '*$2(&w6 "KST中文")'
  IntOp $7 $6 + 4096
  System::Call 'KERNEL32::VirtualProtect(p r7, p 4096, i 1, *i .r8)i.r9'
  StrCmp $9 0 failed
  Push "stack sentinel"
  ${SAFE_POINTER_COPY}
  StrCmp $1 0 failed
  StrCmp $3 "KST中文" 0 failed
  Pop $9
  StrCmp $9 "stack sentinel" 0 failed
  # Empty string immediately before the guard page must also terminate safely.
  IntOp $2 $7 - 2
  ${SAFE_POINTER_COPY}
  StrCmp $1 0 failed
  StrCmp $3 "" 0 failed
  System::Call 'KERNEL32::VirtualFree(p r6, p 0, i 0x8000)i.r9'
  StrCmp $9 0 failed

  # Exercise the exact production block; no KF_FLAG_CREATE in this probe.
  StrCpy $1 "register one"
  StrCpy $2 "register two"
  StrCpy $3 "register three"
  Push "known folder sentinel"
${PATCHED_KNOWN_FOLDER_BLOCK}
  StrCmp $0 "" failed
  StrCmp $1 "register one" 0 failed
  StrCmp $2 "register two" 0 failed
  StrCmp $3 "register three" 0 failed
  Pop $9
  StrCmp $9 "known folder sentinel" 0 failed

  # Unknown KNOWNFOLDERID: leave the original fallback, preserve registers.
  !undef FOLDERID_UserProgramFiles
  !define FOLDERID_UserProgramFiles {00000000-0000-0000-0000-000000000000}
${PATCHED_KNOWN_FOLDER_BLOCK}
  StrCmp $0 "$LocalAppData\Programs" 0 failed
  StrCmp $1 "register one" 0 failed
  StrCmp $2 "register two" 0 failed
  StrCmp $3 "register three" 0 failed
  SetErrorLevel 0
  Quit
failed:
  SetErrorLevel 51
  Quit
SectionEnd
`
}

export function runKnownFolderProbe() {
  if (process.platform !== 'win32') throw new Error('The real NSIS memory probe requires Windows')
  const dataRoot = path.resolve(process.env.TOOLBOX_DATA_ROOT || 'D:/AmazonToolboxData')
  const nsisRoot = process.env.KST_NSIS_HOME || path.join(dataRoot, 'electron-builder-cache/nsis/nsis-3.0.4.1-nsis-3.0.4.1')
  const compiler = path.join(nsisRoot, 'makensis.exe')
  if (!existsSync(compiler)) throw new Error('NSIS compiler not found; build the candidate first or set KST_NSIS_HOME')
  const parent = path.join(dataRoot, 'installer-smoke')
  mkdirSync(parent, { recursive: true })
  const directory = mkdtempSync(path.join(parent, 'kst-nsis-memory-probe-'))
  const executable = path.join(directory, 'pointer-copy-probe.exe')
  const source = path.join(directory, 'pointer-copy-probe.nsi')
  writeFileSync(source, renderKnownFolderProbe(executable), 'utf8')
  const compiled = spawnSync(compiler, ['/INPUTCHARSET', 'UTF8', '/V2', source], { encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  if (compiled.error || compiled.status !== 0) throw new Error(`NSIS probe compilation failed: ${compiled.error?.message || compiled.stderr || compiled.stdout}`)
  const result = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true, timeout: 20_000 })
  const report = { kind: 'nsis-memory-api-probe', passed: !result.error && result.status === 0, exitCode: result.status, error: result.error?.message, assertions: ['guard-page-unicode', 'guard-page-empty', 'register-and-stack-preservation', 'known-folder-fallback'], executable }
  writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2), 'utf8')
  if (!report.passed) throw new Error(`NSIS memory probe failed (${result.status}); evidence: ${directory}`)
  console.log(`nsis_known_folder_memory_probe=passed evidence=${directory}`)
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runKnownFolderProbe()
