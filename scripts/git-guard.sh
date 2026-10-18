#!/usr/bin/env bash
set -euo pipefail
mode=${1:?pre-commit 또는 pre-push가 필요합니다}
branch=$(git symbolic-ref --quiet --short HEAD || true)
block() { echo "차단: $1. feature 브랜치와 PR을 사용하세요." >&2; exit 1; }
case "$mode" in
  pre-commit)
    case "$branch" in main|develop) block "$branch 직접 커밋 금지" ;; esac
    [ -n "$branch" ] || block 'detached HEAD 커밋 금지'
    ;;
  pre-push)
    # 현재 브랜치뿐 아니라 명시적 refspec의 실제 목적지도 확인한다.
    while read -r local_ref local_sha remote_ref remote_sha; do
      case "$remote_ref" in refs/heads/main|refs/heads/develop) block "$remote_ref 직접 푸시/삭제 금지" ;; esac
    done
    case "$branch" in main|develop) block "$branch 직접 푸시 금지" ;; esac
    ;;
  *) echo "알 수 없는 가드 모드: $mode" >&2; exit 1 ;;
esac
