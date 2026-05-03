#!/usr/bin/env bash
set -euo pipefail

export APP_HOST="${APP_HOST:-0.0.0.0}"
export APP_PORT="${APP_PORT:-${PORT:-7860}}"
export API_HOST="${API_HOST:-$APP_HOST}"
export API_PORT="${API_PORT:-$APP_PORT}"

WORKER_SUPERVISOR_PID=""

cleanup() {
  trap - EXIT INT TERM
  if [[ -n "${WORKER_SUPERVISOR_PID}" ]] && kill -0 "${WORKER_SUPERVISOR_PID}" 2>/dev/null; then
    kill -TERM "${WORKER_SUPERVISOR_PID}" 2>/dev/null || true
    wait "${WORKER_SUPERVISOR_PID}" 2>/dev/null || true
  fi
}

run_worker_forever() {
  while true; do
    echo "[worker] starting arq worker..."
    python -m arq datareaper.workers.scheduler.WorkerSettings
    exit_code=$?
    echo "[worker] exited with code ${exit_code}; retrying in 5s"
    sleep 5
  done
}

trap cleanup EXIT INT TERM

run_worker_forever &
WORKER_SUPERVISOR_PID=$!

echo "[api] starting uvicorn on ${APP_HOST}:${APP_PORT}"
uvicorn datareaper.main:app --host "${APP_HOST}" --port "${APP_PORT}"
api_exit_code=$?

cleanup
exit "${api_exit_code}"
