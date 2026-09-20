import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const parent = resolve('D:/AmazonToolboxData/installer-smoke')
const scratch: string[] = []
const helper = readFileSync(resolve('scripts/read-windows-shortcut.ps1'), 'utf8')

afterEach(() => {
  for (const directory of scratch.splice(0)) {
    if (!directory.startsWith(parent + sep) || !basename(directory).startsWith('kst-link-test-')) throw new Error('Unowned shortcut test directory')
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Unicode native Windows shortcut inspection', () => {
  it('uses the explicit Unicode interface, preserves S_FALSE and never repairs or executes shortcuts', () => {
    expect(helper).toContain('000214F9-0000-0000-C000-000000000046')
    expect(helper).toContain('[PreserveSig]')
    expect(helper).toContain('((IPersistFile)instance).Load(filename, 0)')
    expect(helper).toContain('result != 0 || String.IsNullOrWhiteSpace')
    expect(helper).not.toContain('.Resolve(')
    expect(helper).not.toContain('.Save(')
    expect(helper).not.toContain('WScript.Shell')
  })

  it.skipIf(process.platform !== 'win32')('reads Chinese and emoji links without changing bytes, and rejects absent/empty/corrupt targets', () => {
    mkdirSync(parent, { recursive: true })
    const directory = mkdtempSync(join(parent, 'kst-link-test-'))
    scratch.push(directory)
    const quote = (value: string) => value.replaceAll("'", "''")
    const script = String.raw`
$ErrorActionPreference = 'Stop'
. '${quote(resolve('scripts/read-windows-shortcut.ps1'))}'
# Test-only native writer; all created files remain under the temporary D: root.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
namespace Kst.ShortcutTest {
  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ILink {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count, IntPtr data, uint flags);
    void GetIDList(out IntPtr value); void SetIDList(IntPtr value);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string value);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string value);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string value);
    void GetHotkey(out short value); void SetHotkey(short value);
    void GetShowCmd(out int value); void SetShowCmd(int value);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count, out int index);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string value, int index);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string value, uint reserved);
    void Resolve(IntPtr window, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string value);
  }
  public static class Writer {
    public static void Write(string filename, string target) {
      object instance = Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046"), true));
      try {
        if (!String.IsNullOrEmpty(target)) ((ILink)instance).SetPath(target);
        ((IPersistFile)instance).Save(filename, true);
      } finally { Marshal.FinalReleaseComObject(instance); }
    }
  }
}
'@
$root = '${quote(directory)}'
$target = Join-Path $root '课赛通 KST 🧪.exe'
$link = Join-Path $root '课赛通 真实快捷方式 🧪.lnk'
[IO.File]::WriteAllText($target, 'test fixture only, never execute')
[Kst.ShortcutTest.Writer]::Write($link, $target)
$before = [Convert]::ToBase64String([IO.File]::ReadAllBytes($link))
$actual = Get-WindowsShortcutTarget $link
if ($actual -cne $target) { throw "Native Unicode target mismatch: $actual" }
if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($link)) -ne $before) { throw 'Read mutated shortcut bytes' }
$shell = New-Object -ComObject WScript.Shell
$legacy = $shell.CreateShortcut($link)
try { $wshTarget = [string]$legacy.TargetPath }
finally {
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($legacy) | Out-Null
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null
}
$empty = Join-Path $root 'empty.lnk'
[Kst.ShortcutTest.Writer]::Write($empty, $null)
$corrupt = Join-Path $root 'corrupt.lnk'
[IO.File]::WriteAllText($corrupt, 'not a shell link')
$rejected = @()
foreach ($bad in @($empty, $corrupt, (Join-Path $root 'missing.lnk'))) {
  $failed = $false
  try { Get-WindowsShortcutTarget $bad | Out-Null }
  catch { $failed = $true; $rejected += [IO.Path]::GetFileName($bad) }
  if (-not $failed) { throw "Invalid link was accepted: $bad" }
}
@{ actual = $actual; expected = $target; unchanged = $true; rejected = $rejected; wshTarget = $wshTarget } | ConvertTo-Json -Compress
`
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, PSModulePath: join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/Modules') },
    })
    expect(result.status, result.stderr).toBe(0)
    const evidence = JSON.parse(result.stdout.trim()) as { actual: string, expected: string, unchanged: boolean, rejected: string[], wshTarget: string }
    process.stdout.write(`shortcut_unicode_evidence=${JSON.stringify({ nativeMatches: evidence.actual === evidence.expected,
      wshMatches: evidence.wshTarget === evidence.expected, wshEmpty: evidence.wshTarget.length === 0, unchanged: evidence.unchanged })}\n`)
    expect(evidence.actual).toBe(evidence.expected)
    expect(evidence.unchanged).toBe(true)
    expect(evidence.rejected).toEqual(['empty.lnk', 'corrupt.lnk', 'missing.lnk'])
  })
})
