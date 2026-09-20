@echo off
setlocal EnableExtensions DisableDelayedExpansion
call "%~dp0scripts\toolbox-entry.bat" joint-release %*
exit /b %ERRORLEVEL%
