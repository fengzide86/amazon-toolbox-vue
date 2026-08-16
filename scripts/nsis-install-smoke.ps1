$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$metadata = Get-Content (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$installer = Join-Path $projectRoot ("release\KST Setup {0}.exe" -f $metadata.version)
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw "NSIS installer is missing: $installer"
}

$runnerTemp = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
$smokeId = [guid]::NewGuid().ToString('N')
$smokeRoot = [System.IO.Path]::GetFullPath((Join-Path $runnerTemp "kst-nsis-smoke-$smokeId"))
if (-not $smokeRoot.StartsWith(($runnerTemp.TrimEnd('\') + '\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe NSIS smoke directory: $smokeRoot"
}
$installDir = Join-Path $smokeRoot 'app'
New-Item -ItemType Directory -Path $smokeRoot -Force | Out-Null

function Stop-SmokeProcesses {
    Get-Process | ForEach-Object {
        try {
            if ($_.Path -and $_.Path.StartsWith($installDir, [System.StringComparison]::OrdinalIgnoreCase)) {
                Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
            }
        }
        catch {
            # Some system processes do not expose Path to the runner account.
        }
    }
}

try {
    $install = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru -WindowStyle Hidden
    if ($install.ExitCode -ne 0) { throw "NSIS silent install failed with exit code $($install.ExitCode)" }

    $appExecutable = Join-Path $installDir ("{0}.exe" -f $metadata.build.productName)
    if (-not (Test-Path -LiteralPath $appExecutable -PathType Leaf)) {
        throw "Installed application executable is missing: $appExecutable"
    }

    $app = Start-Process -FilePath $appExecutable -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 8
    if ($app.HasExited) { throw "Packaged application exited during startup with code $($app.ExitCode)" }
    Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
    Stop-SmokeProcesses
    Start-Sleep -Seconds 2

    $uninstaller = Get-ChildItem -LiteralPath $installDir -Filter 'Uninstall*.exe' -File | Select-Object -First 1
    if (-not $uninstaller) { throw "NSIS uninstaller is missing from $installDir" }
    $uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
    if ($uninstall.ExitCode -ne 0) { throw "NSIS silent uninstall failed with exit code $($uninstall.ExitCode)" }

    Write-Output "nsis_install_smoke=passed"
}
finally {
    Stop-SmokeProcesses
    if (Test-Path -LiteralPath $smokeRoot) {
        Remove-Item -LiteralPath $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
