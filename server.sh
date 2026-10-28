#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.server.pid"
LOG_FILE="$SCRIPT_DIR/server.log"
API_PORT="${PORT:-3001}"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

find_listening_pid() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true
  fi
}

detect_web_port() {
  # First check log file for Vite output
  if [[ -f "$LOG_FILE" ]]; then
    local port
    port=$(grep -E -o "http://127\.0\.0\.1:([0-9]+)" "$LOG_FILE" | grep -v ":3001" | tail -n 1 | sed 's/.*://' || true)
    if [[ -n "$port" ]]; then
      echo "$port"
      return
    fi
  fi
  # Fallback to checking default Vite ports
  for p in 5174 5173 5175 5176; do
    if [[ -n "$(find_listening_pid "$p")" ]]; then
      echo "$p"
      return
    fi
  done
  echo "5174"
}

is_running() {
  # Check if PID file exists and process is alive
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi

  # Check if backend port is listening
  local api_pid
  api_pid=$(find_listening_pid "$API_PORT")
  if [[ -n "$api_pid" ]]; then
    return 0
  fi

  return 1
}

start_server() {
  if is_running; then
    local web_port
    web_port=$(detect_web_port)
    echo -e "${YELLOW}Fieldnotes servers are already running!${NC}"
    echo -e "  ${BOLD}Web App:${NC}  ${CYAN}http://127.0.0.1:${web_port}/${NC}"
    echo -e "  ${BOLD}API:${NC}      ${CYAN}http://127.0.0.1:${API_PORT}${NC}"
    echo -e "  ${BOLD}Logs:${NC}     ${LOG_FILE}"
    return 0
  fi

  echo -e "${CYAN}Starting Fieldnotes servers (API + Web)...${NC}"
  cd "$SCRIPT_DIR"

  # Enable job control so the process group survives parent exit
  set -m
  nohup npm run dev:server < /dev/null > "$LOG_FILE" 2>&1 &
  local bg_pid=$!
  disown "$bg_pid" 2>/dev/null || true
  echo "$bg_pid" > "$PID_FILE"

  # Wait up to 12 seconds for the server to spin up
  local waited=0
  local max_wait=12
  local started=0

  while [[ $waited -lt $max_wait ]]; do
    if curl -s "http://127.0.0.1:${API_PORT}/api/feed" >/dev/null 2>&1; then
      started=1
      break
    fi
    sleep 0.5
    waited=$((waited + 1))
  done

  local web_port
  web_port=$(detect_web_port)

  if [[ $started -eq 1 ]]; then
    echo -e "${GREEN}${BOLD}✓ Fieldnotes servers started successfully!${NC}"
    echo -e "  ${BOLD}Web App:${NC}  ${CYAN}http://127.0.0.1:${web_port}/${NC}"
    echo -e "  ${BOLD}API:${NC}      ${CYAN}http://127.0.0.1:${API_PORT}${NC}"
    echo -e "  ${BOLD}PID:${NC}      ${bg_pid}"
    echo -e "  ${BOLD}Logs:${NC}     tail -f ${LOG_FILE}"
  else
    echo -e "${YELLOW}Server started with PID ${bg_pid}, but API healthcheck didn't respond within ${max_wait}s.${NC}"
    echo -e "Check ${LOG_FILE} for details:"
    tail -n 15 "$LOG_FILE" || true
  fi
}

stop_server() {
  local stopped_any=0

  # 1. Kill tracked PID from file if alive
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [[ -n "$pid" ]]; then
      if kill -0 "$pid" 2>/dev/null; then
        echo -e "${CYAN}Stopping Fieldnotes server (PID ${pid})...${NC}"
        # Kill the whole process group
        kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
        stopped_any=1
      fi
    fi
    rm -f "$PID_FILE"
  fi

  # 2. Stop any remaining processes listening on ports
  local api_pid
  api_pid=$(find_listening_pid "$API_PORT")
  if [[ -n "$api_pid" ]]; then
    echo -e "${CYAN}Stopping process on API port ${API_PORT} (PID ${api_pid})...${NC}"
    kill -TERM "$api_pid" 2>/dev/null || true
    stopped_any=1
  fi

  for p in 5173 5174 5175 5176; do
    local wp
    wp=$(find_listening_pid "$p")
    if [[ -n "$wp" ]]; then
      # Make sure it's node/vite before killing
      local cmd
      cmd=$(ps -p "$wp" -o comm= 2>/dev/null || true)
      if [[ "$cmd" =~ node|vite ]]; then
        echo -e "${CYAN}Stopping process on Web port ${p} (PID ${wp})...${NC}"
        kill -TERM "$wp" 2>/dev/null || true
        stopped_any=1
      fi
    fi
  done

  # Wait a moment for graceful exit
  sleep 1

  # Force kill if still holding ports
  api_pid=$(find_listening_pid "$API_PORT")
  if [[ -n "$api_pid" ]]; then
    kill -9 "$api_pid" 2>/dev/null || true
  fi

  for p in 5173 5174 5175 5176; do
    local wp
    wp=$(find_listening_pid "$p")
    if [[ -n "$wp" ]]; then
      kill -9 "$wp" 2>/dev/null || true
    fi
  done

  if [[ $stopped_any -eq 1 ]]; then
    echo -e "${GREEN}${BOLD}✓ Fieldnotes servers stopped.${NC}"
  else
    echo -e "${YELLOW}Fieldnotes servers were not running.${NC}"
  fi
}

status_server() {
  if is_running; then
    local web_port
    web_port=$(detect_web_port)
    local api_pid
    api_pid=$(find_listening_pid "$API_PORT")
    local main_pid=""
    if [[ -f "$PID_FILE" ]]; then
      main_pid=$(cat "$PID_FILE" 2>/dev/null || true)
    fi

    echo -e "${GREEN}${BOLD}● Fieldnotes servers are RUNNING${NC}"
    [[ -n "$main_pid" ]] && echo -e "  ${BOLD}Main Process PID:${NC} ${main_pid}"
    [[ -n "$api_pid" ]] && echo -e "  ${BOLD}API PID:${NC}          ${api_pid}"
    echo -e "  ${BOLD}Web App:${NC}           ${CYAN}http://127.0.0.1:${web_port}/${NC}"
    echo -e "  ${BOLD}API Backend:${NC}       ${CYAN}http://127.0.0.1:${API_PORT}${NC}"
    echo -e "  ${BOLD}Logs:${NC}              ${LOG_FILE}"
  else
    echo -e "${RED}${BOLD}○ Fieldnotes servers are STOPPED${NC}"
  fi
}

show_logs() {
  if [[ ! -f "$LOG_FILE" ]]; then
    echo -e "${YELLOW}No log file found at ${LOG_FILE}.${NC}"
    exit 0
  fi
  echo -e "${CYAN}Tailing ${LOG_FILE} (Ctrl+C to exit)...${NC}"
  tail -n 50 -f "$LOG_FILE"
}

print_help() {
  echo -e "${BOLD}Usage:${NC} ./server.sh [command]"
  echo
  echo -e "${BOLD}Commands:${NC}"
  echo -e "  ${CYAN}start${NC}     Start both backend and web servers in the background"
  echo -e "  ${CYAN}stop${NC}      Stop all running Fieldnotes server processes"
  echo -e "  ${CYAN}restart${NC}   Restart both servers"
  echo -e "  ${CYAN}status${NC}    Check if servers are running, listening ports and PIDs"
  echo -e "  ${CYAN}logs${NC}      Tail server logs in real time"
  echo -e "  ${CYAN}help${NC}      Display this help message"
}

case "${1:-}" in
  start)
    start_server
    ;;
  stop)
    stop_server
    ;;
  restart)
    stop_server
    sleep 1
    start_server
    ;;
  status)
    status_server
    ;;
  logs)
    show_logs
    ;;
  help|--help|-h)
    print_help
    ;;
  "")
    print_help
    ;;
  *)
    echo -e "${RED}Unknown command: $1${NC}"
    echo
    print_help
    exit 1
    ;;
esac
