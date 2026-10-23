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

# `-C <경로>`를 걷어낸 형태로 판정한다 — `git -C /repo push` 는 "git push" 라는
# 문자열을 담지 않아, 이걸 안 걷으면 다른 리포를 지목한 커밋·푸시가 통째로 샌다.
norm=$(printf '%s' "$cmd" | sed 's/git -C[[:space:]]\{1,\}[^[:space:]]\{1,\}/git/g')

# git commit / git push 가 아니면 통과
case "$norm" in
  *"git commit"*|*"git push"*) ;;
  *) exit 0 ;;
esac

# 판정 대상 리포는 명령이 정한다 — 훅은 셸의 현재 위치에서 돌지만, 그 위치가
# 커밋하려는 리포와 다를 수 있다(다른 리포를 `cd`/`git -C`로 지목하는 경우).
# 위치만 보면 엉뚱한 리포의 브랜치로 판정해 정상 커밋을 막거나(오탐),
# 반대로 main·develop 커밋을 놓친다(미탐). 둘 다 명령에서 경로를 읽어 막는다.
target=$(printf '%s' "$cmd" | sed -n 's/.*git -C  *\([^ ]*\).*/\1/p' | head -1)
[ -z "$target" ] && target=$(printf '%s' "$cmd" | sed -n 's/^ *cd  *\([^ &;|]*\).*/\1/p' | head -1)
# 따옴표·물결(~)은 셸이 풀어 주지 않는다 — 직접 벗기고 편다.
target=$(printf '%s' "$target" | tr -d "\"'")
case "$target" in
  "~") target="$HOME" ;;
  "~/"*) target="$HOME/${target#\~/}" ;;
esac
[ -n "$target" ] && [ ! -d "$target" ] && target=""

branch=$(git -C "${target:-.}" branch --show-current 2>/dev/null)
if [ "$branch" = "main" ] || [ "$branch" = "develop" ]; then
  echo "차단: $branch 브랜치에 직접 commit/push 금지입니다. /start-story 로 스토리 브랜치를 먼저 만드세요." >&2
  exit 2
fi
exit 0
