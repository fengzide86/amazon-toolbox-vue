@echo off
setlocal EnableExtensions DisableDelayedExpansion
call "%~dp0scripts\toolbox-entry.bat" pack %*
exit /b %ERRORLEVEL%
