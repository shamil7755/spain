@echo off
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo Сначала выполните сборку: npm run build
  pause
  exit /b 1
)
start "" "%~dp0dist\index.html"
