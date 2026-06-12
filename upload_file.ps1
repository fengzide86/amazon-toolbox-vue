param([string]$FilePath, [string]$ServerUrl)

$fileName = [System.IO.Path]::GetFileName($FilePath)
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"

$bodyLines = @(
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"",
    "Content-Type: application/octet-stream",
    "",
    (Get-Content $FilePath -Raw -Encoding Byte),
    "--$boundary--"
)

# Use WebClient for binary-safe upload
$wc = New-Object System.Net.WebClient
$wc.Headers.Add("Content-Type", "multipart/form-data; boundary=$boundary")

# Build body as bytes
$encoding = [System.Text.Encoding]::GetEncoding(28591)
$headerStr = "--$boundary$LF"
$headerStr += "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"$LF"
$headerStr += "Content-Type: application/octet-stream$LF$LF"
$footerStr = "$LF--$boundary--$LF"

$headerBytes = $encoding.GetBytes($headerStr)
$footerBytes = $encoding.GetBytes($footerStr)
$fileBytes = [System.IO.File]::ReadAllBytes($FilePath)

$totalLen = $headerBytes.Length + $fileBytes.Length + $footerBytes.Length
$bodyBytes = New-Object byte[] $totalLen
[System.Buffer]::BlockCopy($headerBytes, 0, $bodyBytes, 0, $headerBytes.Length)
[System.Buffer]::BlockCopy($fileBytes, 0, $bodyBytes, $headerBytes.Length, $fileBytes.Length)
[System.Buffer]::BlockCopy($footerBytes, 0, $bodyBytes, $headerBytes.Length + $fileBytes.Length, $footerBytes.Length)

try {
    $response = $wc.UploadData("$ServerUrl/api/updates/upload", "POST", $bodyBytes)
    $responseText = $encoding.GetString($response)
    Write-Host $responseText
    exit 0
} catch {
    Write-Host ("Upload failed: " + $_.Exception.Message)
    exit 1
}