#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
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
  echo "5174"
}

tracked_server_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid command cwd group
  pid=$(cat "$PID_FILE" 2>/dev/null || true)
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  command=$(ps -p "$pid" -o command= 2>/dev/null || true)
  [[ "$command" == *"npm run dev:server"* ]] || return 1
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)
  [[ "$cwd" == "$SCRIPT_DIR" ]] || return 1
  group=$(ps -p "$pid" -o pgid= 2>/dev/null | tr -d '[:space:]')
  # start_server creates a dedicated process group. Never signal our own group.
  [[ "$group" == "$pid" ]] || return 1
  echo "$pid"
}

is_running() {
  tracked_server_pid >/dev/null
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

  if ! command -v lsof >/dev/null 2>&1; then
    echo "lsof is required to identify Fieldnotes processes safely."
    return 1
  fi
  local port
  for port in "$API_PORT" 5174; do
    if [[ -n "$(find_listening_pid "$port")" ]]; then
      echo "Port $port is already in use. Stop that process explicitly before starting Fieldnotes."
      return 1
    fi
  done

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
  local pid
  pid=$(tracked_server_pid || true)
  if [[ -z "$pid" ]]; then
    rm -f "$PID_FILE"
    echo -e "${YELLOW}No managed Fieldnotes server is running. Other processes were left alone.${NC}"
    return 0
  fi

  echo -e "${CYAN}Stopping Fieldnotes server group (PID ${pid})...${NC}"
  kill -TERM -"$pid" 2>/dev/null || true
  sleep 1
  # Escalate only while the same validated group leader is still present.
  if [[ "$(tracked_server_pid || true)" == "$pid" ]]; then
    kill -KILL -"$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo -e "${GREEN}${BOLD}✓ Fieldnotes servers stopped.${NC}"
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
