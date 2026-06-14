@echo off
echo ========================================
echo   Ventura Fresh Laundry - Deploy (Windows)
echo ========================================
echo.

echo [1/2] Building frontend...
cd frontend
echo Running yarn build...
yarn build
if %errorlevel% neq 0 (
    echo ERROR: Frontend build failed!
    pause
    exit /b 1
)
cd ..

echo.
echo [2/2] Starting backend server...
cd backend
echo Starting uvicorn on port 8001...
start "Ventura Fresh Backend" cmd /k "uvicorn server:app --host 0.0.0.0 --port 8001 --reload"

echo.
echo Deployment complete!
echo.
echo Backend is running on http://localhost:8001
echo Visit http://localhost:8001 to access the application
echo.
echo Press any key to exit...
pause >nul
