@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found. Install Node.js and try again.
    set "EXIT_CODE=1"
    goto :failed
)

node "%~dp0scripts\toolbox-cli.mjs" preview %*
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" exit /b 0

:failed
echo [ERROR] Development preview failed. Review the message above.
if not defined TOOLBOX_NO_PAUSE pause
exit /b %EXIT_CODE%
