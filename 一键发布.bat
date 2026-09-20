@echo off
setlocal EnableExtensions DisableDelayedExpansion
call "%~dp0scripts\toolbox-entry.bat" release --publish %*
exit /b %ERRORLEVEL%
