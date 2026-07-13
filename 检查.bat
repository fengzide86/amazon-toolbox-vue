@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"
set "PYTHON=%CD%\venv\Scripts\python.exe"

echo ============================================
echo   Amazon Toolbox - Verification
echo ============================================

if not exist "%PYTHON%" (
    echo [ERROR] Python virtual environment was not found.
    exit /b 1
)

echo [1/3] Running frontend tests...
call npm test
if errorlevel 1 exit /b 1

echo [2/3] Running backend tests...
pushd backend
"%PYTHON%" -m pytest --rootdir=. -v --tb=short
set "TEST_EXIT_CODE=%ERRORLEVEL%"
popd
if not "%TEST_EXIT_CODE%"=="0" exit /b %TEST_EXIT_CODE%

echo [3/3] Checking local services...
curl -s http://localhost:8000/api/health >nul 2>&1
if errorlevel 1 (
    echo [WARN] Backend is not running. E2E tests skipped.
    exit /b 0
)
curl -s http://localhost:3000 >nul 2>&1
if errorlevel 1 (
    echo [WARN] Vite is not running. E2E tests skipped.
    exit /b 0
)

call npm run test:e2e
exit /b %ERRORLEVEL%
