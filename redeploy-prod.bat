@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo ========================================
echo   Ventura Fresh Laundry - Redeploy (Prod)
echo ========================================
echo.

set LOCAL_REMOTE=ventura
set LOCAL_BRANCH=main

set REMOTE_USER=root
set REMOTE_HOST=2.25.206.249
set REMOTE_DIR=~/venturafreshlaundry
set REMOTE_REMOTE=origin
set REMOTE_BRANCH=main

set COMMIT_MSG=%*
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Redeploy

echo [1/5] Checking local git status...
git status
if %errorlevel% neq 0 (
  echo ERROR: git status failed
  exit /b 1
)

echo.
echo [2/5] Committing local changes (if any)...
git add -A
if %errorlevel% neq 0 (
  echo ERROR: git add failed
  exit /b 1
)

git diff --cached --quiet
if %errorlevel% neq 0 (
  git commit -m "%COMMIT_MSG%"
  if %errorlevel% neq 0 (
    echo ERROR: git commit failed
    exit /b 1
  )
) else (
  echo No changes to commit.
)

echo.
echo [3/5] Pushing to %LOCAL_REMOTE%/%LOCAL_BRANCH%...
git push %LOCAL_REMOTE% %LOCAL_BRANCH%
if %errorlevel% neq 0 (
  echo ERROR: git push failed
  exit /b 1
)

echo.
echo [4/5] Deploying on server via SSH...
ssh %REMOTE_USER%@%REMOTE_HOST% "set -e; cd %REMOTE_DIR%; echo '--- server: pwd ---'; pwd; echo '--- server: git status (before) ---'; git status --porcelain || true; if [ -f backend/static/index.html ]; then git restore backend/static/index.html || true; fi; git clean -fd backend/static || true; echo '--- server: git pull ---'; git pull %REMOTE_REMOTE% %REMOTE_BRANCH%; echo '--- server: venv ---'; if [ -f venv/bin/activate ]; then . venv/bin/activate; fi; python -V; pip -V; if [ -f backend/requirements.txt ]; then pip install -r backend/requirements.txt; fi; echo '--- server: pm2 restart ---'; pm2 restart all --update-env; pm2 status; echo '--- server: health ---'; curl -s -o /dev/null -w 'health_http=%{http_code}\n' http://127.0.0.1:8001/api/health || true; echo '--- server: done ---'"
if %errorlevel% neq 0 (
  echo ERROR: ssh deploy failed
  exit /b 1
)

echo.
echo [5/5] Done.
echo.
endlocal
