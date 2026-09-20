@echo off
setlocal EnableExtensions DisableDelayedExpansion
call "%~dp0scripts\toolbox-entry.bat" preview %*
exit /b %ERRORLEVEL%
