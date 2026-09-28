@echo off
setlocal EnableExtensions
title Amazon AI Public Demo
cd /d "%~dp0"

echo.
echo ========================================
echo   Amazon AI Public Demo Launcher
echo ========================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-public-demo.ps1"
set "RESULT=%ERRORLEVEL%"

echo.
if not "%RESULT%"=="0" echo [ERROR] Startup failed. Review the message above.
echo Press any key to close this window. Background services will keep running.
pause >nul
exit /b %RESULT%
