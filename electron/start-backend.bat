@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "TOOLBOX_RUNTIME_DIR=D:\AmazonToolboxData"
set "APPDATA=%TOOLBOX_RUNTIME_DIR%"
if not exist "%TOOLBOX_RUNTIME_DIR%" mkdir "%TOOLBOX_RUNTIME_DIR%"

toolbox-backend.exe
exit /b %ERRORLEVEL%
