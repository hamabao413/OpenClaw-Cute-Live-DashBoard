@echo off
setlocal
cd /d %~dp0

REM Minimal ASCII-only launcher to avoid CMD encoding issues.
python --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python not found. Please install Python 3.10+ and enable "Add Python to PATH".
  pause
  exit /b 1
)

echo [INFO] Starting OpenClaw Agent Live Dashboard...
python server.py
pause
