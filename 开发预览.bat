@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call "%~dp0dev-preview.bat"
exit /b %ERRORLEVEL%
