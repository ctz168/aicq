@echo off
title AICQ Server
cd /d "%~dp0"

echo ========================================
echo    AICQ AI聊天服务器 - Quick Start
echo ========================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.10+
    pause
    exit /b 1
)

:: Step 1: Install core dependencies
echo [1/3] Installing core dependencies...
pip install -r requirements.txt -q
if errorlevel 1 (
    echo [WARN] Core dependency install had errors, retrying...
    pip install -r requirements.txt
)

echo [2/3] Installing tray dependencies...
pip install -r tray-requirements.txt -q
if errorlevel 1 (
    echo [WARN] Tray dependency install had errors, retrying...
    pip install -r tray-requirements.txt
)

:: Step 2: Quick dependency check - if pystray can't import, tray will fail
echo [3/3] Verifying tray dependencies...
python -c "import pystray; import PIL; import psutil; print('  OK: All tray dependencies ready.')" 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] Tray dependencies missing! Please run:
    echo   pip install pystray Pillow psutil
    echo.
    echo Starting in console mode instead...
    python server.py
    exit /b 1
)

:: Step 3: Clean old log
if exist tray_manager.log del tray_manager.log >nul 2>&1

:: Step 4: Start tray manager with pythonw (no console window)
echo.
echo Starting tray manager...
start "AICQ Tray" pythonw tray_manager.py

:: Wait a moment and check if it actually started
timeout /t 3 >nul

:: Check if pythonw process is running
tasklist /FI "IMAGENAME eq pythonw.exe" 2>nul | find /i "pythonw.exe" >nul
if errorlevel 1 (
    echo.
    echo [WARN] Tray manager may have failed to start (pythonw not running).
    echo   Trying with python instead...
    echo.
    :: Fallback: use python with minimized window
    start /MIN "AICQ Tray" python tray_manager.py
    timeout /t 3 >nul
    tasklist /FI "IMAGENAME eq python.exe" 2>nul | find /i "python.exe" >nul
    if errorlevel 1 (
        echo [ERROR] Tray manager failed to start!
        echo   Check tray_manager.log for details.
        echo   Or run manually: python tray_manager.py
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo   Tray manager is running!
echo   - Right-click tray icon for options
echo   - Service auto-starts with tray
echo   - You can close this window
echo ========================================
echo.
timeout /t 5 >nul
