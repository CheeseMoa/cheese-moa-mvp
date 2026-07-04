---
name: finish-story
description: >-
  현재 스토리 브랜치 작업을 마무리한다 — 커밋·푸시, develop 대상 PR 생성, 테스트 가이드 출력,
  Jira에 PR 링크 코멘트(가능하면). 머지와 스토리 '완료' 처리는 사용자가 수동으로 하며, 스킬은
  그 체크리스트만 안내한다. 사용자가 "/finish-story", "스토리 마무리", "PR 올려"로 요청할 때 사용.
---

# finish-story — 스토리 마무리 / PR 올리기

이 스킬은 **PR을 올리는 데까지만** 한다. **머지와 Jira '완료' 전환은 사용자가 직접** 한다(사용자 선호).
스킬은 마지막에 수동 마무리 체크리스트만 보여준다.

## 고정 상수
- Jira cloudId: `31e41c3d-492d-4abe-b056-7486d55d84ca`, 프로젝트 `CHMO`
- 상태 전이 id: 완료 = `31` (사용자가 수동 전환할 때 참고용)
- PR base 브랜치: `develop` (Git Flow — `docs/convention.md`)

Jira 도구 미로드면 ToolSearch: `mcp__jira__getJiraIssue`(AC 조회용), `mcp__jira__addCommentToJiraIssue`(PR 코멘트용). (상태 전환 도구는 쓰지 않는다 — 완료 전환은 사용자 수동.)

## 절차

1. **브랜치 확인** — `git rev-parse --abbrev-ref HEAD`. `feature/CHMO-<번호>-...` 형태가 아니면 어느 스토리인지 묻는다. 브랜치명에서 `CHMO-<번호>` 추출. (이미 머지된 PR이 있으면 — `gh pr view --json state,mergedAt` — 올릴 게 없으니 아래 **수동 마무리 체크리스트**만 보여주고 끝낸다.)

2. **CLAUDE.md 동기화 점검** — 이번 스토리 변경으로 `CLAUDE.md` 서술이 사실과 어긋났으면 갱신해 **같은 커밋에 포함**한다. 점검 대상 — `## 프로젝트` 현재 단계, `## 기술 스택`(스택·버전·코드 구조), `## 명령어`, `## 하드 제약`, 확정/미확정 결정, 워크플로우 스킬 목록. 실제로 바뀐 게 없으면 손대지 않는다. (담기 애매한 배경·의사결정 맥락은 메모리에 기록.)

3. **커밋** — 변경분을 스테이징 후 커밋. 제목은 **`[CHMO-<번호>] type: 메세지`** 형식(type: feat/fix/docs/style/refactor/test/chore — `docs/convention.md`). 성격이 다른 변경(예: 스토리 무관 도구·스킬 추가)은 커밋을 분리한다. 커밋 메시지 끝에:
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

4. **푸시** — `git push -u origin <현재 브랜치>`.

5. **PR 생성/갱신** — PR이 없으면 `gh pr create --base develop --title "[CHMO-<번호>] <요약>" --body-file <템플릿>`. 이미 있으면 push로 자동 갱신.

6. **테스트 가이드** — `/test-guide` 절차(`.claude/skills/test-guide`)로 이번 변경의 자동 검증 결과 + "진입 경로 → 조작 → 기대 결과" 수동 체크리스트를 만들어 사용자에게 보여주고, PR 본문 `## 테스트` 섹션도 같은 내용으로 채운다.

7. **Jira PR 링크 코멘트(best-effort)** — `addCommentToJiraIssue`로 PR URL을 코멘트로 남긴다. **jira 인증이 안 돼 있거나 실패하면 중단하지 말고**, 붙여넣을 코멘트 문구를 출력해 사용자가 수동으로 달 수 있게 한다. Jira **상태는 건드리지 않는다**('진행 중' 유지).

8. **수동 마무리 체크리스트 출력** — 아래를 사용자에게 안내하고 끝낸다(스킬은 여기까지):
   - PR URL과 스토리 AC 체크리스트
   - 마무리는 직접: ① GitHub에서 리뷰 후 **스쿼시 머지** → ② 로컬 정리 `git switch develop && git pull && git branch -d feature/CHMO-<번호>-...` → ③ Jira 스토리를 **'완료'로 전환**(전이 id `31`) + 필요 시 담당자 지정.

### PR 본문 템플릿
~~~
## 요약
<한두 줄>

## 작업 내용 (AC)
- [ ] <완료조건 1>
- [ ] <완료조건 2>

## 테스트
- <자동 검증 결과 + 수동 확인 체크리스트>

관련: CHMO-<번호>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
~~~

## 주의
- **머지·브랜치 삭제·Jira 완료 전환은 스킬이 하지 않는다.** 사용자가 수동으로 한다(사용자 선호 [[finish-story-manual-merge-complete]]).
- `main`·`develop`에는 직접 커밋/푸시하지 않는다(가드 훅 차단).
