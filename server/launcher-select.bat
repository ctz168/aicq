@echo off
chcp 65001 >nul 2>&1
title AICQ Launcher
cd /d "%~dp0"

echo.
echo ════════════════════════════════════════════
echo   AICQ AI聊天服务器 — 启动模式选择
echo ════════════════════════════════════════════
echo.
echo   1. 托盘模式 (Tray Mode)
echo      - 最小化到系统托盘运行
echo      - 右键托盘图标可控制服务
echo      - 支持开机自启动
echo.
echo   2. 控制台模式 (Console Mode)
echo      - 在命令行窗口中运行
echo      - 可直接查看服务器日志输出
echo      - 按 Ctrl+C 停止服务
echo.

set /p choice="请选择启动模式 [1/2]: "

if "%choice%"=="1" (
    echo.
    echo [INFO] 正在以托盘模式启动...
    call start.bat
) else if "%choice%"=="2" (
    echo.
    echo [INFO] 正在以控制台模式启动...
    call run.bat
) else (
    echo.
    echo [ERR] 无效选择，请重新运行并输入 1 或 2
    pause
    exit /b 1
)
