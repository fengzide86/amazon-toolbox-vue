$filePath = Join-Path $PSScriptRoot "test.yml"
echo "test" | Out-File -FilePath $filePath -Encoding ASCII

$uri = 'http://8.130.113.104:8000/api/updates/upload'
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"

$bodyLines = @(
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"test.yml`"",
    "Content-Type: application/octet-stream",
    "",
    (Get-Content $filePath -Raw),
    "--$boundary--"
)
$body = $bodyLines -join $LF

$r = Invoke-WebRequest -Uri $uri -Method POST -ContentType "multipart/form-data; boundary=$boundary" -Body $body
Write-Host $r.Content

Remove-Item $filePath