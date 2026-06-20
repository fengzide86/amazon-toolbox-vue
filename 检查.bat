@echo off
echo ========================================
echo   Code Check - Run Frontend and Backend Tests
echo ========================================
echo.

echo [1/3] Running frontend tests...
echo ----------------------------------------
call npm test
if %errorlevel% neq 0 (
    echo.
    echo [FAIL] Frontend tests failed!
    echo.
    pause
    exit /b 1
)
echo.
echo [PASS] Frontend tests passed!
echo.

echo [2/3] Running backend tests...
echo ----------------------------------------
cd backend
call python -m pytest --rootdir=. -v --tb=short
if %errorlevel% neq 0 (
    echo.
    echo [FAIL] Backend tests failed!
    cd ..
    pause
    exit /b 1
)
cd ..
echo.
echo [PASS] Backend tests passed!
echo.

echo [3/3] Running E2E tests (requires frontend and backend services running)...
echo ----------------------------------------
echo Checking service status...

:: Check backend service
set BACKEND_READY=0
python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=3)" >nul 2>&1
if %errorlevel% equ 0 set BACKEND_READY=1

:: Check frontend service
set FRONTEND_READY=0
python -c "import urllib.request; urllib.request.urlopen('http://localhost:3000', timeout=3)" >nul 2>&1
if %errorlevel% equ 0 set FRONTEND_READY=1

if %BACKEND_READY% equ 1 if %FRONTEND_READY% equ 1 (
    echo [OK] Both frontend and backend services are running
    goto :RUN_E2E_PROMPT
)

echo [WARN] Frontend or backend services are not running!
echo.
echo Please run start.bat first, then re-run this check script.
echo.
echo Skipping E2E tests.
echo.
goto :SKIP_E2E

:RUN_E2E_PROMPT
echo.
set /p RUN_E2E="Run E2E tests? (y/n): "
if /i "%RUN_E2E%"=="y" (
    call npx playwright test
    if %errorlevel% neq 0 (
        echo.
        echo [FAIL] E2E tests failed!
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [PASS] E2E tests passed!
    echo.
) else (
    echo [SKIP] E2E tests skipped
    echo.
)

:SKIP_E2E
echo ========================================
echo   All tests passed!
echo ========================================
pause