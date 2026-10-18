#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
current=$(git config --local --get core.hooksPath || true)
if [ -n "$current" ] && [ "$current" != '.githooks' ]; then
  echo "기존 core.hooksPath=$current 를 보존했습니다. 기존 훅과 통합 후 설치하세요." >&2
  exit 1
fi
if [ -z "$current" ]; then
  for hook in pre-commit pre-push; do
    path=$(git rev-parse --git-path "hooks/$hook")
    if [ -e "$path" ]; then
      echo "기존 훅 $path 를 보존했습니다. 통합 후 설치하세요." >&2
      exit 1
    fi
  done
fi
chmod +x .githooks/pre-commit .githooks/pre-push
git config --local core.hooksPath .githooks
echo 'Git 가드 설치 완료: .githooks (공유 Git 설정이므로 연결된 worktree에도 적용)'
