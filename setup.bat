@echo off
echo ========================================
echo   Ventura Fresh Laundry - Setup (Windows)
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed. Please install Python 3.8+ first.
    pause
    exit /b 1
)

echo [1/4] Setting up backend...
cd backend
if not exist ".env" (
    echo Creating backend .env file from example...
    copy .env.example .env
)
echo Installing Python dependencies...
pip install -r requirements.txt
cd ..

echo.
echo [2/4] Setting up frontend...
cd frontend
if not exist ".env" (
    echo Creating frontend .env file from example...
    copy .env.example .env
)
echo Installing Node.js dependencies with yarn...
yarn install
cd ..

echo.
echo [3/4] Setting up notifications node...
cd backend\notifications_node
if exist "package.json" (
    echo Installing Node.js dependencies for notifications...
    yarn install
)
cd ..\..

echo.
echo [4/4] Setup complete!
echo.
echo Next steps:
echo 1. Edit backend\.env and frontend\.env with your actual credentials
echo 2. Make sure MongoDB is running locally or update MONGO_URL in backend\.env
echo 3. Run "deploy.bat" to build and start the application
echo.
pause
