@echo off
setlocal EnableExtensions
title Amazon AI Selection Demo
cd /d "%~dp0"

echo.
echo ========================================
echo   Amazon AI Selection Demo Launcher
echo ========================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-demo-server.ps1"
set "RESULT=%ERRORLEVEL%"

echo.
if not "%RESULT%"=="0" echo [ERROR] Startup failed. Review the message above.
if "%RESULT%"=="0" echo [OK] You may close this window. The service will keep running.
echo Press any key to close this window.
pause >nul
exit /b %RESULT%
