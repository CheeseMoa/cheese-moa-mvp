# 치즈모아 작업 지침

## 협업

- 사용자 응답·문서는 한국어로 작성한다. 결과에 영향을 주는 애매한 요구사항·미확정 정책은 사용자에게 묻는다.
- 먼저 `git status --short`를 확인한다. 사용자의 기존 변경·다른 worktree 작업을 보존하고 무관한 파일을 스테이징하지 않는다.
- 프론트엔드 저장소다. BE/AI 코드는 수정하지 않는다. 비밀값·환경파일·실제 얼굴 사진은 커밋하지 않는다.
- `main`·`develop`에는 직접 커밋/푸시하지 않는다. Git Flow와 `[CHMO-###] type: 메시지` 형식은 `docs/convention.md`를 따른다.
- 스토리 시작은 `$start-story`, 검증 안내는 `$test-guide`, 마무리는 `$finish-story`, 결함 설명은 `$bug-briefing`을 사용한다. 정본은 `.agents/skills/`다.
- `$finish-story` 호출 또는 스토리 마무리 요청은 develop PR 머지·브랜치 정리·Jira 완료까지다. PR만 요청하면 PR까지만 한다. main 머지는 명시적인 릴리스 지시가 필요하다.
- Jira·Figma 도구는 사용 가능 여부부터 확인한다. 미연결이면 수행했다고 보고하지 않는다. 티켓 설명·AC 또는 화면 명세로 진행 가능한 작업은 진행한다.

## 프로젝트와 문서

React 18 + TypeScript + Vite + React Router 6 + Tailwind 3 모바일웹이다. 기본 화면 프레임은 390×844이며 Flutter 웹뷰와도 연동한다. 모임 > 이벤트 > 앨범 구조에서 사진을 업로드·AI 분류·검수·공개한다.

작업 전 관련 문서를 읽는다:

- 기능·정책: `docs/feature-spec.md`, `docs/mvp-explanation.md`
- 화면·라우트·미확정 사항: `docs/screen-spec.md`, `src/router.tsx`
- API: `docs/api-spec.md`, `docs/api-changelog.md`, `src/types/api.ts`
- 어드민: `docs/admin-spec.md` — 구현은 `src/admin/`에 격리한다.
- 디자인: `docs/design/screen-system.dc.html`, `tailwind.config.js`(토큰 원천). 기존 디자인을 우선한다. UI 신규 설계는 `$frontend-design`, UI/접근성 리뷰는 `$web-design-guidelines`를 참고한다.
- 미확정 결정은 `docs/screen-spec.md` §5에서 확인한다. 홈 관리자 배지·품질 제외 사진 라우팅·common 앨범 정의를 임의로 확정하지 않는다.
- 외부 페이지 현지화: `src/i18n/`의 ko/en/ja와 외부 라우트 지연 로딩 경계를 사용한다. `?lang=` → 브라우저 선호 언어 → 영어 순이며 본체·어드민은 한국어를 유지한다. 초대 키·모임명은 번역하거나 분석에 넣지 않는다.
- 법적 고지: `docs/legal/` 정본과 `src/legal/` 앱 노출 문구를 함께 확인한다. 보유기간·동의·버전·구현 완료 여부를 임의로 확정하지 않는다.
- 상세 구현 배경·변경 이력: `docs/agent-context.md`의 관련 절만 읽는다. 과거 정책과 후속 반전이 함께 있으므로 최신 명세·코드와 대조한다.

Figma file `pcgDOk6iZYtuUEhKhaPWPM`, 모바일 page `211:1311`, 어드민 page `287:3`. 화면별 노드는 screen-spec 매핑표를 사용한다.

## 구현 경계

- 실 BE 계약을 기준으로 한다. 봉투 `{isSuccess, code, message, result}`, 숫자 ID, BE 필드/enum·시각 변환은 `src/api/client.ts`, `errors.ts`, `mappers.ts`와 도메인 API 모듈이 소유한다. 화면에 DTO 해석을 중복하지 않는다. 미확인 에러 코드를 추측해 고정하지 않는다.
- 인증 갱신·토큰 저장은 기존 client/auth 계층을 사용한다. 화면에서는 공용 `useApi`·`useMutation`의 캐시·취소·401 처리 관용을 따른다.
- 앱 감지·호출은 `src/native/`만 통한다. 푸시는 `src/lib/push.ts`, 통계는 `src/lib/analytics.ts`, 모션은 `src/lib/motion.ts`가 단일 창구다. 분석 이벤트에 이름·URL·식별자·서버 메시지 원문을 넣지 않는다.
- 공개 단위는 이벤트, 무로그인 공유 링크 단위는 모임이다. 뷰어 노출은 검수·공개를 모두 충족해야 한다. 인물·공통 앨범의 전량 검수가 공개 게이트이며 검토 완료는 비가역이다.
- 비즈니스 모임 합류는 승인제, 일반 모임 합류는 즉시 ACTIVE다. 예전 선생님/학부모 전용 모델을 일반 모임에 일괄 적용하지 않는다.
- 추가 업로드·재분석은 복원된 기능이다. 업로드 한도는 `src/lib/upload.ts`의 BE 배치/웹 선택 상수를 구분한다. 과거 1회 업로드 제한을 되살리지 않는다.
- MSW는 로컬 개발용이다. 실 BE 검증 시 비활성화하고 결과를 구분한다. 계약 테스트는 실 BE 응답 픽스처를 사용하며 MSW가 자기 자신을 검증하게 만들지 않는다.

## 실행과 검증

Node 20(CI 기준), npm과 `package-lock.json`을 사용한다.

- 설치: `npm ci`
- 개발: `npm run dev`(5173), 목 개발: `npm run dev:mock`(5199)
- 검증: `npm run verify` = typecheck → lint → Vitest → production build
- 필요한 개별 검사: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- 전체 `npm run format`은 무관 파일까지 바꾼다. 변경 파일만 포맷한다. 기존 포맷 잔재 때문에 전체 `format:check`를 품질 게이트로 사용하지 않는다.
- 화면 변경은 사용 가능한 브라우저로 확인한다. 실기기·외부 연동 등 미실행 검증은 명시한다.
- Git 가드 설치: `npm run hooks:install`. `.githooks/`는 main/develop 직접 commit/push를 막고 commit/push 전 typecheck·lint·test를 실행한다. 가드를 우회하지 않는다.
- 검색 시 `.claude/worktrees/`, `.worktrees/`, node_modules, dist를 제외한다. 기존 worktree는 `git worktree list`로 확인하며 임의 삭제하지 않는다.

상시 규칙 변경은 이 파일, 상세 배경은 `docs/agent-context.md`, 재사용 절차는 `.agents/skills/`에 기록한다. Claude 진입점은 이 파일을 참조한다.
