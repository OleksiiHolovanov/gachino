@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ не найден. Установите Node.js: https://nodejs.org/
  pause
  exit /b 1
)
echo Gachino: http://127.0.0.1:3000
node server.js
pause
