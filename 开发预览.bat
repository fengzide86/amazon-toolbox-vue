@echo off
setlocal EnableExtensions DisableDelayedExpansion
call "%~dp0scripts\toolbox-entry.bat" preview admin %*
exit /b %ERRORLEVEL%
