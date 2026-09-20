param(
    [string]$PreviousInstaller = $env:NSIS_PREVIOUS_INSTALLER,
    [string]$PreviousVersion = $(if ($env:NSIS_PREVIOUS_VERSION) { $env:NSIS_PREVIOUS_VERSION } elseif ($env:NSIS_BASELINE_VERSION) { $env:NSIS_BASELINE_VERSION } else { '1.8.5' }),
    [ValidateRange(1, 3)][int]$DiagnosticAttempts = 1
)
$ErrorActionPreference = 'Stop'

# /D isolates files, not this AppID's registry/shortcuts. Never use a developer's account.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'Real NSIS tests require a disposable GitHub-hosted Windows runner. Use unpacked runtime smoke locally.'
}
if (-not (Test-Path -LiteralPath 'D:\' -PathType Container)) { throw 'NSIS smoke requires D: storage' }
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$metadata = Get-Content (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$installer = Join-Path $projectRoot ("release\KST Setup {0}.exe" -f $metadata.version)
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "NSIS installer missing: $installer" }
$uninstallKeys = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
foreach ($key in $uninstallKeys) {
    if (-not (Test-Path -LiteralPath $key)) { continue }
    $existing = Get-ChildItem -LiteralPath $key | Get-ItemProperty |
        Where-Object { $_.DisplayName -match '课赛通|AmazonToolbox|amazon-toolbox' }
    if ($existing) { throw 'An existing KST installation is registered; refusing to overwrite/uninstall it' }
}

$smokeId = [guid]::NewGuid().ToString('N')
$smokeRoot = [System.IO.Path]::GetFullPath("D:\AmazonToolboxData\installer-smoke\kst-nsis-smoke-$smokeId")
$installDir = Join-Path $smokeRoot 'app'
$diagnostics = Join-Path $projectRoot "test-results\nsis\$smokeId"
New-Item -ItemType Directory -Path $smokeRoot, $diagnostics -Force | Out-Null
@{ kind = 'disposable-nsis'; id = $smokeId } | ConvertTo-Json | Set-Content (Join-Path $smokeRoot 'smoke-owner.json') -Encoding UTF8
$attempts = [System.Collections.Generic.List[object]]::new()
$hadInstallFailure = $false
$startedAt = Get-Date
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
$env:TEMP = Join-Path $smokeRoot 'installer-temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null

function Assert-SmokeDescendant([string]$Target) {
    $resolved = [System.IO.Path]::GetFullPath($Target)
    if (-not $resolved.StartsWith(($smokeRoot.TrimEnd('\') + '\'), [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe smoke target: $resolved"
    }
    return $resolved
}
function Stop-SmokeProcesses {
    $prefix = (Assert-SmokeDescendant $installDir).TrimEnd('\') + '\'
    Get-Process | ForEach-Object {
        try {
            if ($_.Path -and $_.Path.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
            }
        } catch { }
    }
}
function Save-Diagnostics {
    $attempts | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $diagnostics 'install-attempts.json') -Encoding UTF8
    # Capture before retry/cleanup: an access violation alone is not a diagnosis.
    try {
        Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $startedAt; Id = @(1000, 1001) } -ErrorAction Stop |
            Where-Object { $_.Message -match 'KST|nsis|课赛通' } |
            Select-Object TimeCreated, Id, ProviderName, Message |
            ConvertTo-Json -Depth 4 | Set-Content (Join-Path $diagnostics 'windows-application-errors.json') -Encoding UTF8
    } catch {
        $_.Exception.Message | Set-Content (Join-Path $diagnostics 'event-log-unavailable.txt') -Encoding UTF8
    }
    if (Test-Path -LiteralPath $installDir) {
        Get-ChildItem -LiteralPath $installDir -File -Recurse |
            Select-Object @{ Name = 'RelativePath'; Expression = { $_.FullName.Substring($installDir.Length + 1) } }, Length, LastWriteTimeUtc |
            ConvertTo-Json -Depth 4 | Set-Content (Join-Path $diagnostics 'installed-files.json') -Encoding UTF8
    }
    Get-ChildItem -LiteralPath $smokeRoot -Filter '*.json' -File | Copy-Item -Destination $diagnostics -Force
}
function Invoke-Install([string]$InstallerPath, [string]$Stage) {
    $hash = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA512).Hash
    for ($attempt = 1; $attempt -le $DiagnosticAttempts; $attempt++) {
        Write-Output "nsis_stage=$Stage nsis_install_attempt=$attempt"
        $start = Get-Date
        $process = Start-Process -FilePath $InstallerPath -ArgumentList @('/S', '/currentuser', "/D=$installDir") -PassThru -WindowStyle Hidden
        if (-not $process.WaitForExit(120000)) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            throw "NSIS $Stage timed out after 120 seconds"
        }
        $process.Refresh()
        $code = $process.ExitCode
        $hex = [BitConverter]::ToUInt32([BitConverter]::GetBytes([int]$code), 0).ToString('X8')
        $attempts.Add(@{ stage = $Stage; attempt = $attempt; exitCode = $code; exitCodeHex = "0x$hex";
            startedAt = $start.ToUniversalTime().ToString('o'); durationMs = ((Get-Date) - $start).TotalMilliseconds; sha512 = $hash })
        if ($code -eq 0) { return }
        $script:hadInstallFailure = $true
        Save-Diagnostics
        if ($code -ne -1073741819 -or $attempt -eq $DiagnosticAttempts) {
            throw "NSIS $Stage failed: $code (0x$hex). Diagnostics: $diagnostics"
        }
        if ((Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA512).Hash -ne $hash) { throw 'Installer changed; refusing diagnostic retry' }
        Write-Warning 'Access violation, root cause unknown. Diagnostic retry only; this gate will remain failed.'
        Stop-SmokeProcesses
        Start-Sleep -Seconds (2 * $attempt)
    }
}
function Invoke-Runtime([string]$Mode, [string]$Version) {
    $executable = Join-Path $installDir ("{0}.exe" -f $metadata.build.productName)
    & node (Join-Path $PSScriptRoot 'packaged-runtime-smoke.mjs') --executable $executable --root $smokeRoot --mode $Mode --version $Version
    if ($LASTEXITCODE -ne 0) { throw "Installed runtime $Mode verification failed" }
}

try {
    if ($PreviousInstaller) {
        $fixtureFiles = @{ '1.8.5' = 'nsis-upgrade-fixture.json'; '1.8.7' = 'nsis-upgrade-fixture-1.8.7.json' }
        if (-not $fixtureFiles.ContainsKey($PreviousVersion)) { throw "Unsupported pinned NSIS baseline: $PreviousVersion" }
        $fixture = Get-Content (Join-Path $PSScriptRoot $fixtureFiles[$PreviousVersion]) -Raw | ConvertFrom-Json
        if ($fixture.version -ne $PreviousVersion -or
            (Get-Item -LiteralPath $PreviousInstaller).Length -ne $fixture.size -or
            (Get-FileHash -LiteralPath $PreviousInstaller -Algorithm SHA512).Hash.ToLowerInvariant() -ne $fixture.sha512) {
            throw "Old installer does not match the pinned released $PreviousVersion binary"
        }
        Invoke-Install $PreviousInstaller 'old-version'
        Invoke-Runtime 'seed' $fixture.version
        Invoke-Install $installer 'upgrade'
    } else {
        Invoke-Install $installer 'clean-install'
        Invoke-Runtime 'seed' $metadata.version
    }
    Invoke-Runtime 'check' $metadata.version
    Stop-SmokeProcesses
    $sentinel = Join-Path $smokeRoot 'unrelated-install\keep.txt'
    New-Item -ItemType Directory -Path (Split-Path $sentinel) -Force | Out-Null
    'Unrelated application must survive KST uninstall' | Set-Content -LiteralPath $sentinel -Encoding UTF8
    $userFiles = @('user-credential.bin', 'update-preferences.json', 'customer-file.txt')
    $userHashes = @{}
    foreach ($name in $userFiles) { $userHashes[$name] = (Get-FileHash -LiteralPath (Join-Path $smokeRoot "user-data\$name")).Hash }
    $uninstaller = Get-ChildItem -LiteralPath $installDir -Filter 'Uninstall*.exe' -File | Select-Object -First 1
    if (-not $uninstaller) { throw 'NSIS uninstaller missing' }
    $uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -PassThru -WindowStyle Hidden
    if (-not $uninstall.WaitForExit(120000)) { throw 'NSIS uninstall timed out' }
    $uninstall.Refresh()
    if ($uninstall.ExitCode -ne 0) { throw "NSIS uninstall failed: $($uninstall.ExitCode)" }
    $deadline = (Get-Date).AddSeconds(20)
    $installedExe = Join-Path $installDir ("{0}.exe" -f $metadata.build.productName)
    while ((Test-Path -LiteralPath $installedExe) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
    if (Test-Path -LiteralPath $installedExe) { throw 'Uninstaller returned but installed executable remains' }
    if (-not (Test-Path -LiteralPath $sentinel)) { throw 'Uninstall removed an unrelated sibling directory' }
    foreach ($name in $userFiles) {
        if ((Get-FileHash -LiteralPath (Join-Path $smokeRoot "user-data\$name")).Hash -ne $userHashes[$name]) {
            throw "Uninstall changed preserved user data: $name"
        }
    }
    if ($hadInstallFailure) { throw 'A diagnostic retry recovered, but an installer crash occurred; gate remains failed' }
    @{ status = 'passed'; upgradeFrom = $(if ($PreviousInstaller) { $fixture.version } else { $null }); version = $metadata.version;
        userDataPreserved = $true; unrelatedDirectoryPreserved = $true } |
        ConvertTo-Json | Set-Content (Join-Path $diagnostics 'result.json') -Encoding UTF8
    Write-Output 'nsis_install_smoke=passed'
} finally {
    Stop-SmokeProcesses
    Save-Diagnostics
    $env:TEMP = $previousTemp
    $env:TMP = $previousTmp
    # Preserve the isolated root for runner inspection; never erase an installation after a crash.
    Write-Output "nsis_diagnostics=$diagnostics"
}
