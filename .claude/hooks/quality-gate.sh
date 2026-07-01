#!/usr/bin/env bash
# PreToolUse(Bash/PowerShell) 품질 게이트: git commit/push 직전에 typecheck·lint 를 돌린다.
# package.json 이 없으면(스캐폴딩 전) 통과. 실패 시 exit 2 로 커밋/푸시 차단.

input=$(cat)

if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
else
  cmd=$input
fi
[ -z "$cmd" ] && cmd=$input

case "$cmd" in
  *"git commit"*|*"git push"*) ;;
  *) exit 0 ;;
esac

[ -f package.json ] || exit 0

has_script() { node -e "process.exit(((require('./package.json').scripts)||{})['$1']?0:1)" 2>/dev/null; }

fail=0
if has_script typecheck; then
  echo "[quality-gate] npm run typecheck" >&2
  npm run --silent typecheck >&2 || fail=1
fi
if has_script lint; then
  echo "[quality-gate] npm run lint" >&2
  npm run --silent lint >&2 || fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "차단: typecheck/lint 실패 — 고친 뒤 다시 커밋/푸시하세요." >&2
  exit 2
fi
exit 0
