@echo off
setlocal
chcp 65001 >nul
title Pattern Studio - stop

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Stop-LocalApp.ps1"
set "APP_EXIT_CODE=%ERRORLEVEL%"

if not "%APP_EXIT_CODE%"=="0" (
  echo.
  echo Не удалось корректно остановить приложение. Код ошибки: %APP_EXIT_CODE%
  pause
) else (
  timeout /t 2 /nobreak >nul
)

exit /b %APP_EXIT_CODE%
