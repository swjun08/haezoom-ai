#!/bin/bash
# 해줌 AI 시연 사이트 실행 — 더블클릭하면 로컬 서버를 켜고 Chrome으로 엽니다.
cd "$(dirname "$0")"
PORT=4180
if ! lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  python3 -m http.server $PORT >/dev/null 2>&1 &
  SERVER=$!
  sleep 1
fi
open -a "Google Chrome" "http://localhost:$PORT/"
echo "해줌 시연 사이트: http://localhost:$PORT/"
echo "이 창을 닫으면 서버도 꺼져요."
[ -n "$SERVER" ] && wait $SERVER
