---
name: finish-story
description: >-
  현재 스토리 브랜치 작업을 마무리한다 — 커밋·푸시, develop 대상 PR 생성, 테스트 가이드 출력,
  Jira PR 링크 코멘트, develop 머지, 원격·로컬 브랜치 정리, Jira '완료' 전환까지. main 머지는 릴리즈 성격이라
  사용자가 명시 지시할 때만 한다. 사용자가 "/finish-story", "스토리 마무리", "PR 올려"로 요청할 때 사용.
---

# finish-story — 스토리 마무리 (develop 머지·Jira 완료까지)

이 스킬은 **develop 머지와 Jira '완료' 전환까지** 한다(2026-08-03 사용자 결정 — 종전 "PR까지만, 머지는 수동"에서 변경).
**`main` 머지는 하지 않는다** — 릴리즈 성격이라 사용자가 명시 지시할 때만(그때는 develop 머지 후 `develop → main` PR을 만들어 같은 방식으로 머지).

## 고정 상수
- Jira cloudId: `31e41c3d-492d-4abe-b056-7486d55d84ca`, 프로젝트 `CHMO`
- 상태 전이 id: 완료 = `31`
- PR base 브랜치: `develop` (Git Flow — `docs/convention.md`)
- 머지 방식: **머지 커밋**(`gh pr merge --merge`) — 리포 이력이 스쿼시가 아니라 머지 커밋 관행(PR #140·142·144…)

Jira 도구 미로드면 ToolSearch: `mcp__jira__getJiraIssue`(AC 조회용), `mcp__jira__addCommentToJiraIssue`(PR 코멘트용), `mcp__jira__transitionJiraIssue`(완료 전환용).

## 절차

1. **브랜치 확인** — `git rev-parse --abbrev-ref HEAD`. `feature/CHMO-<번호>-...` 형태가 아니면 어느 스토리인지 묻는다. 브랜치명에서 `CHMO-<번호>` 추출. (이미 머지된 PR이 있으면 — `gh pr view --json state,mergedAt` — 남은 단계(Jira 완료·정리)만 이어서 한다.)

2. **CLAUDE.md 동기화 점검** — 이번 스토리 변경으로 `CLAUDE.md` 서술이 사실과 어긋났으면 갱신해 **같은 커밋에 포함**한다. 점검 대상 — `## 프로젝트` 현재 단계, `## 기술 스택`(스택·버전·코드 구조), `## 명령어`, `## 하드 제약`, 확정/미확정 결정, 워크플로우 스킬 목록. 실제로 바뀐 게 없으면 손대지 않는다. (담기 애매한 배경·의사결정 맥락은 메모리에 기록.)

3. **커밋** — 변경분을 스테이징 후 커밋. 제목은 **`[CHMO-<번호>] type: 메세지`** 형식(type: feat/fix/docs/style/refactor/test/chore — `docs/convention.md`). 성격이 다른 변경(예: 스토리 무관 도구·스킬 추가)은 커밋을 분리한다. 커밋 메시지 끝에:
   `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

4. **푸시** — `git push -u origin <현재 브랜치>`.

5. **PR 생성/갱신** — PR이 없으면 `gh pr create --base develop --title "[CHMO-<번호>] <요약>" --body-file <템플릿>`. 이미 있으면 push로 자동 갱신.

6. **테스트 가이드** — `/test-guide` 절차(`.claude/skills/test-guide`)로 이번 변경의 자동 검증 결과 + "진입 경로 → 조작 → 기대 결과" 수동 체크리스트를 만들어 사용자에게 보여주고, PR 본문 `## 테스트` 섹션도 같은 내용으로 채운다.

7. **develop 머지 + 정리** — `gh pr merge <PR번호> --merge`. 실패(브랜치 보호·충돌 등)하면 원인을 보여주고 사용자 판단을 기다린다. 머지 후 **원격·로컬 정리까지 한다**:
   - 원격 feature 브랜치 삭제: `git push origin --delete <브랜치>`
   - **본 체크아웃 세션이면**: `git switch develop && git pull --ff-only && git branch -d <브랜치>`
   - **워크트리 세션이면**: 본 체크아웃(`~/Developer/cheese-moa-mvp`, develop)을 `git -C <본 폴더> pull --ff-only`로 최신화한다(본 폴더가 dirty·비FF면 중단 말고 안내만). 로컬 feature 브랜치는 워크트리가 물고 있으면 다음 브랜치로 갈아탄 뒤 `git branch -d`, 워크트리 자체는 세션 종료 시 제거로 정리.

8. **Jira 마무리** — `addCommentToJiraIssue`로 PR URL 코멘트(best-effort — 실패 시 중단하지 말고 문구만 출력) → `transitionJiraIssue`(id `31`)로 **'완료' 전환**. 담당자 지정은 여전히 사용자 몫.

9. **요약 출력** — 머지된 PR URL·AC 체크 결과·Jira 상태·남은 수동 항목(담당자 지정, 실기기 확인 등)을 안내하고 끝낸다.

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
- **main 머지는 스킬 범위 밖** — 사용자가 명시 지시할 때만(이력: 2026-08-03 CHMO-551은 지시로 main까지 머지).
- `main`·`develop`에는 직접 커밋/푸시하지 않는다(가드 훅 차단) — 머지는 항상 GitHub PR(`gh pr merge`) 경유.
