@echo off
chcp 65001 >nul
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo 没找到 Node,请先装 Node.js LTS: https://nodejs.org/zh-cn
  pause
  exit /b 1
)
if not exist node_modules (
  echo 第一次运行,装依赖(约半分钟)...
  call npm install --no-audit --no-fund
)
start "" http://localhost:8788
node run.js
pause
