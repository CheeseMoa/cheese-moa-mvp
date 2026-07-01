---
name: finish-story
description: >-
  현재 스토리 브랜치 작업을 마무리한다 — 커밋·푸시, main 대상 PR 생성, Jira에 PR 링크 코멘트.
  PR 머지 후 다시 실행하면 브랜치 정리 + Jira '완료' 전환. 사용자가 "/finish-story", "스토리 마무리", "PR 올려/정리해"로 요청할 때 사용.
---

# finish-story — 스토리 마무리 / PR

## 고정 상수
- Jira cloudId: `31e41c3d-492d-4abe-b056-7486d55d84ca`, 프로젝트 `CHMO`
- 상태 전이 id: 완료 = `31`
- PR base 브랜치: `main`

필요 도구 미로드면 ToolSearch: `mcp__jira__getJiraIssue`, `mcp__jira__addCommentToJiraIssue`, `mcp__jira__transitionJiraIssue`.

## 모드 판별
1. 현재 브랜치 확인: `git rev-parse --abbrev-ref HEAD`. `feature/CHMO-<번호>-...` 형태가 아니면 어느 스토리인지 묻는다.
2. 브랜치명에서 `CHMO-<번호>` 추출.
3. `gh pr view --json state,url,mergedAt` 로 해당 브랜치 PR 상태 확인.
   - PR 없음 / OPEN → **모드 A**.
   - PR MERGED → **모드 B**.

## 모드 A — 커밋·푸시·PR
1. 변경분이 있으면 스테이징 후 커밋. **Conventional Commits**(`feat:`·`fix:`·`chore:`·`refactor:` …), 본문에 `CHMO-<번호>` 포함. 커밋 메시지 끝에:
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
2. `git push -u origin <현재 브랜치>`.
3. PR이 없으면 `gh pr create --base main --title "CHMO-<번호> [FE] <요약>" --body "<아래 템플릿>"`. 이미 있으면 push로 갱신.
4. `addCommentToJiraIssue`로 PR URL을 코멘트로 남긴다. 상태는 '진행 중' 유지(머지는 사용자 몫).
5. 안내: GitHub에서 리뷰 후 **스쿼시 머지**하고, 머지되면 `/finish-story`를 다시 실행하면 정리+완료 처리한다.

### PR 본문 템플릿
~~~
## 요약
<한두 줄>

## 작업 내용 (AC)
- [ ] <완료조건 1>
- [ ] <완료조건 2>

## 테스트
- <검증 방법>

관련: CHMO-<번호>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
~~~

## 모드 B — 머지 후 정리
1. `git switch main && git pull`.
2. `git branch -d feature/CHMO-<번호>-...` (거부되면 사용자 확인 후 `-D`).
3. `transitionJiraIssue`로 id `31`(완료).
4. 완료 요약 출력(머지된 PR·다음 스토리 제안).
