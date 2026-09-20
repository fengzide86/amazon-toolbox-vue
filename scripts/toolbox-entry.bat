@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-toolbox.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" exit /b 0
echo [ERROR] The requested KST operation failed. Review the message above.
if not defined TOOLBOX_NO_PAUSE pause
exit /b %EXIT_CODE%
