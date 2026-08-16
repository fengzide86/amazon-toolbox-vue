@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call "%~dp0dev-preview.bat" admin %*
exit /b %ERRORLEVEL%
