# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

치즈모아 — 유치원 행사 사진을 AI가 아이별 앨범으로 자동 분류 → 선생님이 검수 → **이벤트별 공개** → 학부모가 링크+비밀번호로 **무로그인** 조회·다운로드하는 **모바일웹** 서비스(MVP).

현재 단계: **스캐폴딩(CHMO-106) + 공용 컴포넌트 세트(CHMO-107) 완료.** Vite+React18+TS 토대·Tailwind v3 디자인 시스템·전 라우트 뼈대·화면 스텁 18개 + 재사용 UI 14종(`src/components/ui/`, 데모 `/dev/components`). 화면별 실제 UI·MSW 핸들러는 후속 스토리에서 구현. 소스 오브 트루스는 여전히 `docs/`.

## 소스 오브 트루스 (작업 전 관련 문서를 읽는다)

화면·기능·데이터 결정은 모두 여기서 나온다.
- `docs/feature-spec.md` — 기능 명세(도메인 모델, 상태머신, 기능 F1~F7, 추적표)
- `docs/screen-spec.md` — 화면 명세(IA, 화면별 카드, 디자인 토큰, 26개 와이어프레임 매핑)
- `docs/api-spec.md` — API 계약(리소스 스키마, 엔드포인트 req/res, 화면 매핑)
- `docs/mvp-explanation.md` — 서비스 배경/취지
- `docs/design/screen-system.dc.html` — **디자인 시안(공용 컴포넌트 스펙)**: Header/Button/Badge/Toggle/카드류/PhotoTile/오버레이/Toast의 색·크기·규칙. 토큰 원천은 `tailwind.config.js`(충돌 시 코드가 이김) · `docs/design/logo-v3.dc.html` — 로고 시안(체다 심볼)

## 확정 MVP 모델 (코드로 추론 불가 — 반드시 준수)

- 정보구조: 모임(Group) > 이벤트(Event) > 앨범(Album). 앨범 `type`: `person`/`common`/`uncertain`/`eyes_closed`/`blurry`.
- 제작자 인증: 닉네임 + 4자리 PIN. **권한 등급 없음** — 로그인한 모임 멤버는 전원 동일(업로드·검수·공개 가능).
- 모임 진입점 2개(분리): ① **선생님 초대** = 제작자 합류(모임 단위, 모임 비밀번호+참여 링크) ② **학부모 공개** = 무로그인 뷰어(**모임 단위** 공유 링크 + **학부모 전용 비밀번호**(모임 비밀번호와 별개, 모임 생성 시 자동), 조회·다운로드만). 비번 입력 후 **공개된 이벤트 목록**에서 선택.
- 공개(publish) 단위: **이벤트별**(검수 → 공개 전 검수 → 공개하기). 학부모 접근(공유) 단위: **모임별**(공개된 이벤트만 목록 노출). 상세 [[viewer-share-group-level]].
- 타깃: 기관(B2B/유치원) 우선. 일반(B2C) 전용 화면은 후순위.

## 하드 제약

- **BE/AI는 건드리지 않는다.** 이번 범위는 프론트엔드뿐. `docs/api-spec.md`는 FE가 소비할 **계약**이며, FE는 **MSW 목 데이터**로 개발한다.
- MVP 제외: 결제/요금제, 다운로드 한도, 휴지통, 인물 병합, 학부모 로그인.

## 기술 스택

React 18 + Vite 5 + TypeScript(모바일웹, 기준 프레임 390×844) · 라우팅 react-router v6 · 스타일링 **Tailwind CSS v3**(토큰은 `tailwind.config.js` + `src/index.css`) · 데이터패칭 커스텀 `useApi` 훅 · API 목 레이어 **MSW**(`VITE_ENABLE_MSW=true`일 때만 활성, 핸들러는 후속 추가).

### 코드 구조 (`src/`)
- `main.tsx` 진입(+MSW 부트스트랩) · `router.tsx` 전 라우트 정의 · `index.css` Tailwind+디자인 토큰.
- `components/` PhoneShell(390×844 프레임)·ScreenStub · `components/ui/` **공용 컴포넌트 세트**(CHMO-107: Header·Button·Badge·Toggle·EmptyState·카드류·PhotoTile/Grid·Modal·BottomSheet·ConfirmDialog·Toast — 데모 `/dev/components`, DEV 전용) · `guards/` 제작자/뷰어 라우트 가드 · `pages/`(+`pages/viewer/`) 화면 스텁.
- `lib/` `api.ts`(fetch 래퍼)·`auth.ts`(제작자 토큰)·`viewer.ts`(뷰어 토큰) · `hooks/useApi.ts` · `types/api.ts`(API 계약 타입) · `mocks/`(MSW).

## 작업 방식

- **애매하면 추론하지 말고 사용자에게 묻는다.** (사용자 명시 선호)
- 사용자·문서는 한국어 — **한국어로 응답**한다.
- 화면 작업 시 와이어프레임을 Figma MCP로 확인: file `pcgDOk6iZYtuUEhKhaPWPM`, page `211:1311`. 화면별 노드 id는 `docs/screen-spec.md` 매핑표 참조.
- **브랜치·커밋 규칙**: `docs/convention.md` 준수 — Git Flow(`main`/`develop`/`feature`/`release`/`hotfix`), 커밋 메시지는 `[CHMO-###] type: 메세지` 형식.
- **스토리 작업 흐름**: 착수는 `/start-story CHMO-###`(Jira SP·상태 세팅 + `develop` 기준 `feature/CHMO-###-*` 브랜치), 마무리는 `/finish-story`(커밋·푸시·`develop` 대상 PR; 머지 후 재실행 시 정리+완료). `main`·`develop` 직접 커밋/푸시는 가드 훅이 차단한다. 담당자는 Jira에서 직접 지정한다. 백로그는 Jira 프로젝트 `CHMO`(에픽 CHMO-96~105 / 스토리 CHMO-106~136).

## 미확정 결정 (임의로 정하지 말 것 · 상세 `docs/screen-spec.md` §5)

홈 관리자 배지 표시 여부 · 품질 제외 사진 라우팅(눈감음/흔들림 앨범) · 공통(common) 앨범 정의. (학부모 공유 = 모임 단위로 **확정**됨.)

## 명령어

- `npm run dev` — 개발 서버(Vite, 기본 5173) · `npm run build` — 타입체크(`tsc --noEmit`)+프로덕션 빌드 · `npm run preview` — 빌드 결과 미리보기.
- `npm run typecheck` · `npm run lint` · `npm run format`(Prettier) — 검사·정리. (테스트 러너는 미설정.)

**워크플로우 스킬**(`.claude/skills/`):
- `/start-story CHMO-###` — 스토리 시작: SP 추천·설정, 상태 '진행 중', `feature/CHMO-###-<slug>` 브랜치 생성.
- `/finish-story` — 커밋·푸시·PR 생성 + Jira PR 코멘트. PR 머지 후 재실행 시 브랜치 정리 + Jira '완료'.

**가드 훅**(`.claude/settings.json` → `.claude/hooks/`): `main` 직접 commit/push 차단, commit/push 전 typecheck·lint(스크립트 정의 시) 실행.
