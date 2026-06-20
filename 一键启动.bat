@echo off
echo ============================================
echo   Amazon Toolbox - One Click Start
echo ============================================
echo.

cd /d "%~dp0"

:: ===== Check Python =====
echo [CHECK] Checking Python environment...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found, please install Python 3.8+
    echo Download: https://www.python.org/downloads/
    pause
    exit /b 1
)
echo [OK] Python installed

:: ===== Check backend dependencies =====
echo.
echo [CHECK] Checking backend dependencies...
cd backend
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [INSTALL] Installing backend dependencies (first run)...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed!
        pause
        exit /b 1
    )
    echo [OK] Backend dependencies installed
) else (
    echo [OK] Backend dependencies ready
)
cd ..

:: ===== Check Node.js =====
echo.
echo [CHECK] Checking Node.js environment...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found, please install Node.js 16+
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js installed

:: ===== Check frontend dependencies =====
echo.
echo [CHECK] Checking frontend dependencies...
if not exist "node_modules\" (
    echo [INSTALL] Installing frontend dependencies (first run)...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Frontend dependency installation failed!
        pause
        exit /b 1
    )
    echo [OK] Frontend dependencies installed
) else (
    echo [OK] Frontend dependencies ready
)

:: ===== Start backend =====
echo.
echo [START] Starting backend service...
start "Backend" cmd /k "cd /d %~dp0backend && python main.py"

:: ===== Wait for backend =====
echo [WAIT] Waiting for backend service to start...
set /a retry=0
:wait_backend
timeout /t 2 /nobreak >nul
set /a retry+=1
python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" >nul 2>&1
if errorlevel 1 (
    if %retry% LSS 15 (
        goto wait_backend
    ) else (
        echo [WARN] Backend startup timeout, please check backend window
    )
) else (
    echo [OK] Backend service ready
)

:: ===== Start frontend =====
echo.
echo [START] Starting frontend service...
start "Frontend" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ============================================
echo   Startup complete!
echo ============================================
echo.
echo  Frontend:  http://localhost:3000
echo  Backend:   http://localhost:8000
echo  API Docs:  http://localhost:8000/docs
echo  Admin:     http://localhost:3000/#/admin/login
echo.
echo  Default admin password: admin123
echo.
echo  Press any key to close this window (services keep running)
pause >nul