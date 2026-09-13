#!/data/data/com.termux/files/usr/bin/bash
# SGU 剑客群组服 状态监测 —— Termux / Linux 启动脚本
# 用法:
#   ./start.sh          后台启动（日志写入 logs/server.log）
#   ./start.sh fg       前台启动
#   ./start.sh stop     停止后台进程
#   ./start.sh status   查看运行状态

set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8787}"
HOST="${HOST:-127.0.0.1}"
PIDFILE="logs/server.pid"
LOGFILE="logs/server.log"

mkdir -p logs

is_running() {
  [ -f "$PIDFILE" ] || return 1
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null
}

case "${1:-bg}" in
  fg)
    exec node server.js
    ;;
  stop)
    if is_running; then
      pid="$(cat "$PIDFILE")"
      kill "$pid" 2>/dev/null || true
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
      done
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
        echo "已强制停止（PID $pid）"
      else
        echo "已停止（PID $pid）"
      fi
    else
      echo "服务未在运行"
    fi
    rm -f "$PIDFILE"
    ;;
  status)
    if is_running; then
      echo "运行中：PID $(cat "$PIDFILE")"
      curl -s "http://${HOST}:${PORT}/api/health" || true
      echo
    elif [ -f "$PIDFILE" ]; then
      echo "未运行（存在残留 PID 文件，直接执行 ./start.sh 即可覆盖）"
    else
      echo "未运行"
    fi
    ;;
  bg|*)
    if is_running; then
      echo "服务已在运行（PID $(cat "$PIDFILE")），如需重启请先执行 ./start.sh stop"
      exit 0
    fi
    rm -f "$PIDFILE"   # 清理残留 PID 文件
    PORT="$PORT" HOST="$HOST" nohup node server.js >>"$LOGFILE" 2>&1 &
    echo $! >"$PIDFILE"
    sleep 2
    if curl -s -o /dev/null "http://${HOST}:${PORT}/api/health"; then
      echo "已启动：http://${HOST}:${PORT}/   （PID $(cat "$PIDFILE")，日志 $LOGFILE）"
    else
      echo "启动失败，最近日志："
      tail -20 "$LOGFILE"
      exit 1
    fi
    ;;
esac
