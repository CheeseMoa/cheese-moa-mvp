#!/usr/bin/env bash
# PreToolUse(Bash/PowerShell) 가드: main 브랜치에서 git commit/push 를 차단한다.
# stdin 으로 훅 페이로드(JSON) 를 받는다. 차단은 exit 2 (+ stderr 메시지).

input=$(cat)

if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
else
  cmd=$input
fi
[ -z "$cmd" ] && cmd=$input

# git commit / git push 가 아니면 통과
case "$cmd" in
  *"git commit"*|*"git push"*) ;;
  *) exit 0 ;;
esac

branch=$(git branch --show-current 2>/dev/null)
if [ "$branch" = "main" ] || [ "$branch" = "develop" ]; then
  echo "차단: $branch 브랜치에 직접 commit/push 금지입니다. /start-story 로 스토리 브랜치를 먼저 만드세요." >&2
  exit 2
fi
exit 0
