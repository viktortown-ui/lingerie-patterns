@echo off
setlocal
chcp 65001 >nul
title Pattern Studio - start

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-LocalApp.ps1"
set "APP_EXIT_CODE=%ERRORLEVEL%"

if not "%APP_EXIT_CODE%"=="0" (
  echo.
  echo Не удалось запустить приложение. Код ошибки: %APP_EXIT_CODE%
  echo Подробности и путь к журналу указаны выше.
  pause
)

exit /b %APP_EXIT_CODE%
