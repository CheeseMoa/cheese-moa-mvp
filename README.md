# 치즈모아 (cheese-moa-mvp)

유치원 행사 사진을 AI가 아이별 앨범으로 자동 분류 → 선생님이 검수 → 이벤트별 공개 → 학부모가 링크+비밀번호로 무로그인 조회·다운로드하는 **모바일웹**(MVP).

- 기준 프레임: **390 × 844**
- 스택: React 18 + Vite + TypeScript · react-router v6 · Tailwind CSS v3 · API 목 레이어 MSW
- 소스 오브 트루스: [`docs/`](./docs) (기능·화면·API 명세)

## 개발

```bash
npm ci
npm run dev          # 개발 서버 (http://localhost:5173)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # Vitest 계약·단위 테스트
npm run build        # 타입체크 + 프로덕션 빌드
npm run verify       # typecheck + lint + test + build
```

### MSW (목 API)

실 BE 연동과 MSW 목 API를 지원한다. 기본은 MSW 비활성이며, `npm run dev:mock`으로 목 서버 모드(5199)를 실행한다.
실 BE 연결 설정은 `.env.example`을 참고한다. 목 로그인은 DEV 전용 `/dev/login`에서 시드 계정을 사용한다.
시드 계정: 이현정/1234 · 무로그인 공유 시연: `/share/shr_grp1`(비밀번호 7421). 실 BE 테스트와 목 테스트 결과를 구분한다.

## 디렉터리

```
src/
  main.tsx            앱 진입 + MSW 부트스트랩
  router.tsx          전체 라우트 정의
  index.css           Tailwind + 디자인 토큰(CSS 변수) + 치즈 도트 유틸
  components/         PhoneShell(390×844 프레임) · 화면 공용 컴포넌트 · ui/(재사용 UI 세트)
  guards/             제작자/뷰어 라우트 가드
  pages/              화면 실 UI (screen-spec 매핑, viewer/는 학부모 뷰어)
  api/                HTTP 클라이언트 · BE DTO 매핑 · 도메인 API
  lib/                토큰 저장 · 통계 · 푸시 · 업로드 등 공용 로직
  native/             Flutter 웹뷰 브리지
  admin/              내부 운영자 화면
  hooks/              useApi · useAlive
  types/              api.ts (API 계약 타입)
  mocks/              MSW 목 레이어 (핸들러 · 픽스처 · 인메모리 DB)
```

## Codex / Claude 작업 환경

Node 20과 npm을 사용한다. 새 체크아웃에서는 아래 명령을 한 번 실행한다.

```bash
npm ci
npm run hooks:install
```

- 공통 지침: [`AGENTS.md`](./AGENTS.md). Claude는 `CLAUDE.md`에서 같은 지침을 가져온다.
- 스킬 정본: `.agents/skills/` — `$start-story CHMO-###`, `$test-guide`, `$finish-story`, `$bug-briefing`, `$frontend-design`, `$web-design-guidelines`. Claude의 기존 스토리 명령은 정본을 참조한다.
- 상세 배경: [`docs/agent-context.md`](./docs/agent-context.md). 이전 Claude 지침의 결정·구현 이력을 보존했으며 관련 절만 읽는다.
- Git 가드: `.githooks/pre-commit`, `pre-push`. main/develop 직접 커밋·푸시(명시적 목적지 포함)를 차단하고 typecheck·lint·test 실패 시 중단한다. build는 `npm run verify`와 CI에서 검사한다.
- 설치기는 기존 hooksPath·Git 훅을 덮어쓰지 않는다. Git 설정은 로컬이며 새 클론마다 설치해야 한다. 연결된 worktree에는 공통 설정이 적용된다. 해제는 `git config --local --unset core.hooksPath`로 한다.
- `.claude/settings.json`의 도구 훅은 Claude 전용이다. Codex에 이 JSON을 복사하는 대신 공통 Git 훅으로 commit/push를 검사한다. Git 훅은 설치된 로컬 환경의 보조 검사이므로 원격 브랜치 보호를 대신하지 않는다.
- Jira(CHMO)·Figma는 사용하는 에이전트 환경에서 별도 연결·인증이 필요하다. `gh`로 PR을 처리할 경우 `gh auth status`로 인증을 확인한다. 자격증명을 저장소에 넣지 않는다.
- 이번 정비에서는 개인 전역 설정·모델·권한·MCP 인증을 변경하지 않았다. 스킬이 목록에 나타나지 않으면 저장소에서 새 Codex 세션을 시작한다.

호출 예: `CHMO-123 작업 시작해`, `$test-guide`, `$finish-story`.
`$finish-story`는 검증 후 develop PR 머지와 Jira 완료까지 진행한다. PR만 원하면 그 범위를 명시한다.

구성 근거: [OpenAI 공식 스킬 문서](https://learn.chatgpt.com/docs/build-skills), [AGENTS.md 문서](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
