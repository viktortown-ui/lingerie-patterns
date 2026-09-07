@echo off
setlocal
chcp 65001 >nul
title Pattern Studio - local server check

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-LocalApp.ps1" -NoBrowser
set "APP_EXIT_CODE=%ERRORLEVEL%"

if not "%APP_EXIT_CODE%"=="0" goto check_result

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Test-LocalServer.ps1"
set "APP_EXIT_CODE=%ERRORLEVEL%"

:check_result
echo.
if "%APP_EXIT_CODE%"=="0" (
  echo Все проверки локального запуска успешно пройдены.
) else (
  echo Проверка локального запуска не пройдена. Код ошибки: %APP_EXIT_CODE%
)
pause

exit /b %APP_EXIT_CODE%
