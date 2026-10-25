@echo off
setlocal
cd /d "%~dp0"
if not exist "caddy.exe" (
  echo.
  echo   caddy.exe not found.
  echo   Download Caddy for Windows amd64 and put caddy.exe here.
  echo.
  pause
  exit /b 1
)
if not exist "C:\TYCL-Server\public" mkdir "C:\TYCL-Server\public"
echo TYCL update server is starting on http://0.0.0.0:8080
echo Keep this window open, or install Caddy as a Windows service.
caddy.exe run --config Caddyfile
pause
