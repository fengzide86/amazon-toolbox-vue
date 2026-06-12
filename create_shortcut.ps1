# 创建快捷方式到桌面工具箱文件夹
$WshShell = New-Object -ComObject WScript.Shell
$ShortcutPath = "C:\Users\冯伟豪\Desktop\工具箱页面\亚马逊工具箱.lnk"
$TargetPath = "D:\amazon-toolbox-vue"

# 确保目标文件夹存在
$ShortcutDir = Split-Path $ShortcutPath -Parent
if (-not (Test-Path $ShortcutDir)) {
    New-Item -ItemType Directory -Path $ShortcutDir -Force
}

# 创建快捷方式
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetPath
$Shortcut.WorkingDirectory = $TargetPath
$Shortcut.Description = "亚马逊赛训效率工具箱"
$Shortcut.Save()

Write-Host "快捷方式已创建: $ShortcutPath"