param([string]$PreviousInstaller, [string]$CandidateDirectory)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $PreviousInstaller) { $PreviousInstaller = Join-Path $projectRoot 'release\KST Setup 1.8.5.exe' }
if (-not $CandidateDirectory) { $CandidateDirectory = Join-Path $projectRoot 'release\win-unpacked' }
$fixture = Get-Content (Join-Path $PSScriptRoot 'nsis-upgrade-fixture.json') -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $PreviousInstaller -Algorithm SHA512).Hash.ToLowerInvariant() -ne $fixture.sha512) {
    throw 'Released 1.8.5 fixture SHA512 does not match'
}
$metadata = Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$root = "D:\AmazonToolboxData\installer-smoke\kst-runtime-smoke-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $root -Force | Out-Null
@{ kind = 'unpacked-data-compatibility'; oldVersion = $fixture.version } |
    ConvertTo-Json | Set-Content (Join-Path $root 'smoke-owner.json') -Encoding UTF8
$oldDirectory = Join-Path $root 'old-package'
$sevenZip = Join-Path $projectRoot 'node_modules\7zip-bin\win\x64\7za.exe'
# Read-only archive extraction: NEVER executes the installer, changes registry or creates shortcuts.
& $sevenZip x $PreviousInstaller "-o$oldDirectory" -y -bso0 -bsp0
if ($LASTEXITCODE -gt 1) { throw 'Unable to extract the old NSIS payload' }
$oldExecutable = Join-Path $oldDirectory ("{0}.exe" -f $metadata.build.productName)
$candidateExecutable = Join-Path $CandidateDirectory ("{0}.exe" -f $metadata.build.productName)
& node (Join-Path $PSScriptRoot 'packaged-runtime-smoke.mjs') --executable $oldExecutable --root $root --mode seed --version $fixture.version
if ($LASTEXITCODE -ne 0) { throw 'Old packaged runtime seed failed' }
& node (Join-Path $PSScriptRoot 'packaged-runtime-smoke.mjs') --executable $candidateExecutable --root $root --mode check --version $metadata.version
if ($LASTEXITCODE -ne 0) { throw 'New packaged runtime compatibility failed' }
Write-Output 'unpacked_upgrade_data_compatibility=passed (not an NSIS installation test)'
Write-Output "runtime_diagnostics=$root"
