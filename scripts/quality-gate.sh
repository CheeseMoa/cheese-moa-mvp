#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
for task in typecheck lint test; do
  echo "[quality-gate] npm run $task" >&2
  npm run --silent "$task"
done
