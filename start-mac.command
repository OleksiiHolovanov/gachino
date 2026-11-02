#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Не найден Node.js. Установите Node.js 20+ с https://nodejs.org/"
  read -p "Нажмите Enter для выхода..."
  exit 1
fi
echo "Gachino запускается: http://127.0.0.1:3000"
node server.js
