@echo off
setlocal EnableExtensions DisableDelayedExpansion
call "%~dp0scripts\toolbox-entry.bat" marketing preview %*
exit /b %ERRORLEVEL%
