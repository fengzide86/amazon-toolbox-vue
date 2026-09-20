param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArguments)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Test-Node22([string]$Executable) {
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
    try {
        $nodeVersion = & $Executable -p 'process.versions.node' 2>$null
        return $LASTEXITCODE -eq 0 -and "$nodeVersion".Trim() -match '^22\.'
    } catch { return $false }
}

try {
    $nodeExecutable = $null
    if ($env:TOOLBOX_NODE_EXE) {
        if (-not (Test-Node22 $env:TOOLBOX_NODE_EXE)) { throw 'TOOLBOX_NODE_EXE must point to an existing Node.js 22 executable.' }
        $nodeExecutable = $env:TOOLBOX_NODE_EXE
    } else {
        $pathNode = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($pathNode -and (Test-Node22 $pathNode.Source)) { $nodeExecutable = $pathNode.Source }
        $toolchains = Join-Path $(if ($env:TOOLBOX_DATA_ROOT) { $env:TOOLBOX_DATA_ROOT } else { 'D:\AmazonToolboxData' }) 'toolchains'
        if (-not $nodeExecutable -and (Test-Path -LiteralPath $toolchains)) {
            $candidates = Get-ChildItem -LiteralPath $toolchains -Directory -Filter 'node-v22.*-win-x64' |
                Sort-Object { [version]($_.Name -replace '^node-v', '' -replace '-win-x64$', '') } -Descending
            foreach ($candidate in $candidates) {
                $executable = Join-Path $candidate.FullName 'node.exe'
                if (Test-Node22 $executable) { $nodeExecutable = $executable; break }
            }
        }
    }
    if (-not $nodeExecutable) { throw 'Node.js 22 is required. Set TOOLBOX_NODE_EXE to its node.exe path; no runtime will be installed automatically.' }
    $env:PATH = (Split-Path -Parent $nodeExecutable) + ';' + $env:PATH
    $pythonExecutable = & $nodeExecutable (Join-Path $PSScriptRoot 'run-python.mjs') --resolve
    if ($LASTEXITCODE -ne 0 -or -not $pythonExecutable) { throw 'No usable project Python was selected. Check TOOLBOX_PYTHON; no environment was installed or modified.' }
    $env:TOOLBOX_PYTHON = "$pythonExecutable".Trim()
    $env:PATH = (Split-Path -Parent $env:TOOLBOX_PYTHON) + ';' + $env:PATH
    if (-not (Get-Command gh.exe -CommandType Application -ErrorAction SilentlyContinue)) {
        $toolchains = Join-Path $(if ($env:TOOLBOX_DATA_ROOT) { $env:TOOLBOX_DATA_ROOT } else { 'D:\AmazonToolboxData' }) 'toolchains'
        if (Test-Path -LiteralPath $toolchains) {
            $githubCli = Get-ChildItem -LiteralPath $toolchains -Directory -Filter 'gh-*' |
                Sort-Object Name -Descending |
                ForEach-Object { Join-Path $_.FullName 'bin\gh.exe' } |
                Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
            if ($githubCli) { $env:PATH = (Split-Path -Parent $githubCli) + ';' + $env:PATH }
        }
    }
    Set-Location -LiteralPath $projectRoot
    Write-Output "[TOOLBOX] Source: $projectRoot"
    Write-Output "[TOOLBOX] Node 22: $nodeExecutable"
    Write-Output "[TOOLBOX] Python: $env:TOOLBOX_PYTHON"
    & $nodeExecutable (Join-Path $PSScriptRoot 'toolbox-cli.mjs') @CliArguments
    exit $LASTEXITCODE
} catch {
    Write-Output "[TOOLBOX] Launcher failed: $($_.Exception.Message)"
    exit 1
}
