#!/usr/bin/env bash
set -euo pipefail

export APP_HOST="${APP_HOST:-0.0.0.0}"
export APP_PORT="${APP_PORT:-${PORT:-7860}}"
export API_HOST="${API_HOST:-$APP_HOST}"
export API_PORT="${API_PORT:-$APP_PORT}"

WORKER_PID=""
API_PID=""

cleanup() {
  trap - EXIT INT TERM
  local pids=()
  if [[ -n "${API_PID}" ]] && kill -0 "${API_PID}" 2>/dev/null; then
    pids+=("${API_PID}")
  fi
  if [[ -n "${WORKER_PID}" ]] && kill -0 "${WORKER_PID}" 2>/dev/null; then
    pids+=("${WORKER_PID}")
  fi

  if ((${#pids[@]} > 0)); then
    kill -TERM "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

python -m arq datareaper.workers.scheduler.WorkerSettings &
WORKER_PID=$!

uvicorn datareaper.main:app --host "${APP_HOST}" --port "${APP_PORT}" &
API_PID=$!

wait -n "${API_PID}" "${WORKER_PID}"
exit_code=$?

cleanup
exit "${exit_code}"
