@echo off
setlocal EnableExtensions DisableDelayedExpansion
call "%~dp0scripts\toolbox-entry.bat" marketing publish %*
exit /b %ERRORLEVEL%
