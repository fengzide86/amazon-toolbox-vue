# upload_file.ps1 - 文件上传脚本（修复中文路径问题）
param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl,
    
    [string]$Token
)

# 解析为绝对路径（支持中文文件名）
$resolvedPath = Resolve-Path -LiteralPath $FilePath
if (-not $resolvedPath) {
    Write-Host "Error: File not found: $FilePath"
    exit 1
}

$fileName = [System.IO.Path]::GetFileName($resolvedPath.Path)
$fileSize = (Get-Item -LiteralPath $resolvedPath.Path).Length

Write-Host "Uploading: $fileName ($([math]::Round($fileSize / 1MB, 2)) MB)..."

try {
    # 使用 .NET HttpClient 上传（支持中文路径）
    Add-Type -AssemblyName System.Net.Http
    
    $client = New-Object System.Net.Http.HttpClient
    $client.Timeout = [TimeSpan]::FromMinutes(10)
    
    if ($Token) {
        $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $Token)
    }
    
    # 构建 multipart form data
    $content = New-Object System.Net.Http.MultipartFormDataContent
    $fileBytes = [System.IO.File]::ReadAllBytes($resolvedPath.Path)
    $fileContent = New-Object System.Net.Http.ByteArrayContent(,$fileBytes)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("application/octet-stream")
    $content.Add($fileContent, "file", $fileName)
    
    # 上传
    $uploadUrl = "$ServerUrl/api/updates/upload"
    $response = $client.PostAsync($uploadUrl, $content).Result
    
    $responseContent = $response.Content.ReadAsStringAsync().Result
    
    if ($response.IsSuccessStatusCode) {
        Write-Host "Upload success: $responseContent"
        exit 0
    } else {
        Write-Host "Upload failed: HTTP $($response.StatusCode) - $responseContent"
        exit 1
    }
} catch {
    Write-Host "Upload failed: $($_.Exception.Message)"
    exit 1
} finally {
    if ($client) {
        $client.Dispose()
    }
}