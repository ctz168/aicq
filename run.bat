@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo.
echo ════════════════════════════════════════════
echo   AICQ AI聊天服务器 — 一键部署 (Windows)
echo ════════════════════════════════════════════
echo.

set "DIR=%~dp0"
set "VENV=%DIR%.venv"
set "PORT=61018"

REM 检测 Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERR] 未检测到 Python，请先安装 Python 3.10+
    echo       https://www.python.org/downloads/
    pause
    exit /b 1
)

python --version 2>&1 | findstr /R "3\.1[0-9]" >nul
if %errorlevel% neq 0 (
    echo [ERR] 需要 Python 3.10+，请升级
    pause
    exit /b 1
)
echo [ OK ] Python 检测通过

REM 创建虚拟环境
if not exist "%VENV%\Scripts\python.exe" (
    echo [INFO] 创建虚拟环境...
    python -m venv "%VENV%"
    echo [ OK ] 虚拟环境创建完成
)

REM 安装依赖
echo [INFO] 安装依赖...
"%VENV%\Scripts\pip.exe" install -q -r "%DIR%requirements.txt"
echo [ OK ] 依赖安装完成

REM 打开浏览器
echo [INFO] 正在打开管理后台...
start http://localhost:%PORT%/admin

REM 启动服务器
echo.
echo   ╔══════════════════════════════════════════════╗
echo   ║   AICQ AI聊天服务器  —  运行中              ║
echo   ╠══════════════════════════════════════════════╣
echo   ║  管理后台: http://localhost:%PORT%/admin       ║
echo   ║  API 文档: http://localhost:%PORT%/api/v1      ║
echo   ║  健康检查: http://localhost:%PORT%/health      ║
echo   ║  按 Ctrl+C 停止服务                          ║
echo   ╚══════════════════════════════════════════════╝
echo.

"%VENV%\Scripts\python.exe" server.py
