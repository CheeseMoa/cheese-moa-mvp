---
name: start-story
description: >-
  Jira CHMO 스토리 작업을 시작한다 — 스토리 조회, 스토리포인트 추천·설정, 상태를 '진행 중'으로 전환,
  main 기준 feature 브랜치 생성까지. 사용자가 "/start-story", "스토리 시작", "CHMO-### 작업 시작"으로 요청할 때 사용.
---

# start-story — 스토리 작업 시작

Jira 스토리 하나를 골라 개발을 시작하는 표준 절차. 인자로 스토리 키(예: `CHMO-106`)를 받는다.

## 고정 상수 (재확인 불필요)
- Jira cloudId: `31e41c3d-492d-4abe-b056-7486d55d84ca`
- 프로젝트: `CHMO`
- 스토리포인트 필드: `customfield_10016` (숫자)
- 상태 전이 id: 진행 중 = `21`, 완료 = `31`
- GitHub 기준(base) 브랜치: `main`
- 브랜치 네이밍: `feature/CHMO-<번호>-<영문-kebab-slug>`

필요한 MCP 도구가 미로드면 ToolSearch로 로드: `mcp__jira__getJiraIssue`, `mcp__jira__editJiraIssue`, `mcp__jira__transitionJiraIssue`, `mcp__jira__searchJiraIssuesUsingJql`.

## 절차

1. **대상 결정** — 인자로 스토리 키가 오면 그대로 사용. 없으면 `searchJiraIssuesUsingJql`로
   `project = CHMO AND statusCategory != Done AND issuetype = "스토리" ORDER BY rank ASC` 조회 → 목록을 보여주고 어느 스토리인지 묻는다.
2. **스토리 조회** — `getJiraIssue`(fields: `summary,description,parent,status,customfield_10016`)로 요약·설명·완료조건(AC)·부모 에픽을 읽는다.
3. **스토리포인트 추천** — 설명/AC의 범위·복잡도를 근거로 피보나치(1·2·3·5·8) **1개**를 제안하고 1줄 근거를 붙인다. 사용자 확인을 받는다.
   - 승인 → `editJiraIssue`로 `{ "customfield_10016": <수> }` 설정.
   - 다른 값 지정 → 그 값으로 설정.
   - 이미 값이 있으면 그대로 두고 변경 여부만 확인.
4. **담당자** — 자동 지정하지 않는다. "담당자는 Jira에서 직접 지정하세요"라고 안내만 한다. *(사용자 선호)*
5. **상태 전이** — 현재 상태가 '해야 할 일'이면 `transitionJiraIssue`로 id `21`(진행 중)로 전환.
6. **브랜치 생성**
   - 미커밋 변경이 있으면 경고하고 stash/커밋 여부를 묻는다.
   - `git switch main && git pull --ff-only` (실패하면 중단하고 사용자에게 알림).
   - 요약을 짧은 영문 kebab-case slug로 변환(한글 요약이면 핵심을 영문으로). `git switch -c feature/CHMO-<번호>-<slug>`.
7. **요약 출력** — 스토리 제목·AC 체크리스트, 생성한 브랜치명, 설정한 SP, (담당자 수동 안내), 상태=진행 중, 다음 단계. 이어서 해당 스토리 구현을 시작한다.

## 주의
- 브랜치명·커밋·PR에 항상 `CHMO-<번호>`를 포함해 Jira 개발 패널이 자동 연동되게 한다.
- `main`에는 직접 커밋/푸시하지 않는다(가드 훅이 차단). 마무리는 `/finish-story`.
