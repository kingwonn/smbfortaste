#!/usr/bin/env bash
# Mac/Linux 一键启动:./start.sh(Windows 用 启动工作台.bat)
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "请先装 Node.js LTS: https://nodejs.org/zh-cn"; exit 1; }
[ -d node_modules ] || { echo "第一次运行,装依赖..."; npm install --no-audit --no-fund; }
( sleep 1; open http://localhost:8788 2>/dev/null || xdg-open http://localhost:8788 2>/dev/null ) &
exec node run.js
