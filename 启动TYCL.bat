@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo   TYCL dependencies are not installed.
  echo   Please run: npm install
  echo.
  pause
  exit /b 1
)
set ELECTRON_RUN_AS_NODE=
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
