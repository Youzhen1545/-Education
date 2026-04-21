@echo off
chcp 65001 >nul 2>&1
title 社会工作伦理案例模拟器 - 部署版

echo ========================================
echo   社会工作伦理案例模拟器 - 本地服务器
echo ========================================
echo.

cd /d "%~dp0"

echo 📍 当前目录: %cd%
echo.
echo 🚀 启动 HTTP 服务器（端口 8080）...
echo.
echo 💡 请在浏览器中访问: http://localhost:8080
echo.
echo ⚠️  按 Ctrl+C 可停止服务器
echo ========================================
echo.

python -m http.server 8080

pause
