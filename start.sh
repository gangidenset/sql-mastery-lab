#!/bin/sh
# SQL MASTERY LAB 起動スクリプト（Mac / Linux）
#   ./start.sh          → http://localhost:8080/
#   ./start.sh 8081     → ポートを変更
cd "$(dirname "$0")" || exit 1
PORT="${1:-8080}"
URL="http://localhost:$PORT/"

echo "============================================"
echo "  SQL MASTERY LAB を起動します"
echo "  $URL"
echo "  終了するときは Ctrl+C を押してください"
echo "============================================"

open_browser() {
  sleep 1
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
  else echo "ブラウザで $URL を開いてください"; fi
}

if command -v node >/dev/null 2>&1; then
  open_browser &
  PORT="$PORT" exec node tools/server.mjs
elif command -v python3 >/dev/null 2>&1; then
  open_browser &
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v python >/dev/null 2>&1; then
  open_browser &
  exec python -m http.server "$PORT" --bind 127.0.0.1
else
  echo "[エラー] Node.js も Python も見つかりませんでした。どちらかをインストールしてください。"
  echo "  Node.js: https://nodejs.org/ja"
  echo "  Python : https://www.python.org/downloads/"
  exit 1
fi
