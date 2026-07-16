# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

치즈모아 — 유치원 행사 사진을 AI가 아이별 앨범으로 자동 분류 → 선생님이 검수 → **이벤트별 공개** → 학부모가 링크+비밀번호로 **무로그인** 조회·다운로드하는 **모바일웹** 서비스(MVP).

현재 단계: **스캐폴딩(CHMO-106) + 공용 컴포넌트 세트(CHMO-107) + MSW 목 레이어(CHMO-108·109) + 인증 플로우 실 UI(CHMO-110) + 모임 진입 실 UI(CHMO-111) + 모임 허브 실 UI(CHMO-112) + 이벤트·업로드·분석 실 UI(CHMO-113) + 앨범 그리드·앨범 상세/삭제 실 UI(CHMO-114) + 옮기기·이름전파 실 UI(CHMO-115) + 공개 전 검수·공개 실 UI(CHMO-116) + 학부모 뷰어 실 UI(CHMO-117) + 설정/프로필·통합 마무리(CHMO-118) 완료 — 전 화면 실 UI.** Vite+React18+TS 토대·Tailwind v3 디자인 시스템·전 라우트 뼈대 + 재사용 UI 세트(`src/components/ui/`, 데모 `/dev/components`) + 목 DB·픽스처·api-spec 전 엔드포인트 핸들러(`src/mocks/` — 인증·모임·이벤트·앨범·검수·공개·뷰어) + 인증 3화면(01·01-1·01-2)·모임 진입 3화면(02 홈·03 모임 만들기·02-1 모임 참여)·모임 허브(05 모임 상세 + 초대·학부모 공유 시트 + ⚙ 모임 설정 — 이름 수정·모임 삭제(CHMO-277, `DELETE /groups/:id` — 실 BE는 CHMO-273 배포 대기, 목 선행))·이벤트 흐름(06-M 생성 모달·06-E 빈 이벤트·06-U 업로드→AI 분석, 분석중 상태 포함)·검수 흐름(08 앨범 그리드+⚙ 이벤트 설정 — 이름 수정·이벤트 삭제(CHMO-278, `DELETE /events/:id` — 실 BE는 CHMO-272 배포 대기, 목 선행. 06-E·분석중에도 헤더 ⚙ 동일 진입)·09 앨범 상세+선택모드·삭제·옮기기(09-1 이동 시트)·라이트박스 크게 보기(CHMO-242 — 일반 모드 사진 탭, 검수 배지+개별 저장+라이트박스 내 삭제/옮기기. 사진 단위 검토 API는 BE 미도입이라 검토 액션 없음)·인물 앨범명 ✎ 이름전파·14 공개 전 검수+공개하기)·학부모 뷰어 흐름(잠금 해제(비번 4자→viewerToken, 401 시 apiFetch가 뷰어 토큰 삭제→잠금 화면 복귀)·15-L 공개 이벤트 목록·15 공개 앨범·16 사진 그리드+일괄 zip 다운로드+개별 저장 라이트박스+공유(Web Share→복사 폴백)) 실제 UI. 설정/프로필(닉네임 프리필·PIN은 입력 시에만 `PATCH /me`에 포함 + 로그아웃)·404(EmptyState)도 실 UI — 스텁 없음(ScreenStub 제거, CHMO-118). 앨범 커버는 `Album.coverThumbnailUrl`(파생), 공개 전 검수 미리보기는 `ReviewSummary.previewThumbnailUrls`(파생), 뷰어 커버는 `ViewerEvent`/`ViewerAlbum.coverThumbnailUrl`(파생 — 검토 완료 사진 기준). 인물 앨범 이름수정은 09 앨범 상세 헤더 ✎(person만) — 변경 시 모임 단위 인물(personId) 이름이 전 이벤트로 전파. 공개(14)는 확인 다이얼로그(미검토 시 경고+force)→published→05 배지·뷰어 목록 노출(기존 코드/목 처리). **BE 실연동 기반(CHMO-191) 완료** — 실 BE 응답 봉투 흡수(`src/api/client.ts`)·에러 코드 정규화(`src/api/errors.ts`)·vite 프록시·숫자 ID(int64) 전환. **엔드포인트 계층(CHMO-192) 완료** — 화면은 URL·응답 형태를 모른다: `src/api/{auth,groups,events,albums,viewer}.ts` 도메인 함수가 경로·요청 바디·응답 변환을 소유하고(`apiFetch` 직접 호출은 `src/api/` 안에만), BE 형태 차이(필드명·대문자 enum·특수 앨범 라벨 파생)는 `src/api/mappers.ts`가 흡수한다. **목 이행(CHMO-195) 완료** — MSW 목이 실 BE 계약(봉투·BE 필드명·bare 배열)으로 응답한다: 스위치 양쪽(`VITE_ENABLE_MSW` true/false)이 같은 계약을 탄다. **업로드 3단계(CHMO-194) 완료** — presign(`{files:[{fileName,size}]}` → `[{s3Key,uploadUrl,contentType}]`) → presigned URL로 S3 직접 PUT(`Content-Type`이 서명과 정확히 일치해야 함 — 아니면 403 SignatureDoesNotMatch) → 등록(`POST /events/:id/photos` `{s3Keys, excludeEyesClosed, excludeBlurry}`). **등록이 곧 분석 시작**(BE가 analyzing 전이 + AI 분류 발행)이라 `POST /analyze`는 부르지 않는다(부르면 같은 사진이 두 job으로 발행). 업로드 제약(확장자 jpg/jpeg/png/heic/webp·20MB·50장)은 `src/lib/upload.ts`가 단일 원천으로 갖고 UI·목이 공유한다. **이제 실 BE 연동 단계 — API가 문서와 안 맞으면 BE가 기준**(하드 제약 참조). 화면·기능 결정의 소스 오브 트루스는 여전히 `docs/`.

## 소스 오브 트루스 (작업 전 관련 문서를 읽는다)

화면·기능·데이터 결정은 모두 여기서 나온다.
- `docs/feature-spec.md` — 기능 명세(도메인 모델, 상태머신, 기능 F1~F7, 추적표)
- `docs/screen-spec.md` — 화면 명세(IA, 화면별 카드, 디자인 토큰, 26개 와이어프레임 매핑)
- `docs/api-spec.md` — API 계약(리소스 스키마, 엔드포인트 req/res, 화면 매핑). **단, 실연동 단계에선 실 BE 스웨거가 우선**(`https://api.cheese-moa.com/v3/api-docs`) — 문서와 다르면 FE를 BE에 맞추고, 문서 갱신은 CHMO-196에서 한다
- `docs/mvp-explanation.md` — 서비스 배경/취지
- `docs/design/screen-system.dc.html` — **디자인 시안(공용 컴포넌트 스펙)**: Header/Button/Badge/Toggle/카드류/PhotoTile/오버레이/Toast의 색·크기·규칙. 토큰 원천은 `tailwind.config.js`(충돌 시 코드가 이김) · `docs/design/logo-v3.dc.html` — 로고 시안(체다 심볼)

## 확정 MVP 모델 (코드로 추론 불가 — 반드시 준수)

- 정보구조: 모임(Group) > 이벤트(Event) > 앨범(Album). 앨범 `type`: `person`/`common`/`uncertain`/`eyes_closed`/`blurry`.
- 제작자 인증: 닉네임 + 4자리 PIN. **권한 등급 없음** — 로그인한 모임 멤버는 전원 동일(업로드·검수·공개 가능).
- 모임 진입점 2개(분리): ① **선생님 초대** = 제작자 합류(모임 단위, 모임 비밀번호+참여 링크) ② **학부모 공개** = 무로그인 뷰어(**모임 단위** 공유 링크 + **학부모 전용 비밀번호**(모임 비밀번호와 별개, 모임 생성 시 자동), 조회·다운로드만). 비번 입력 후 **공개된 이벤트 목록**에서 선택.
- 공개(publish) 단위: **이벤트별**(검수 → 공개 전 검수 → 공개하기). 학부모 접근(공유) 단위: **모임별**(공개된 이벤트만 목록 노출). 상세 [[viewer-share-group-level]].
- 검수: **사진 단위 `reviewed`**(앨범 [검토 완료] = 일괄 처리, 앨범 자체엔 검토 상태 없음) · **미검토 사진은 뷰어 비노출**(서버 필터링) · **공개 후에도 사진 추가·재분석·이동 가능** — `published` 상태 유지, 재분석은 증분(미분류 사진만).
- 타깃: 기관(B2B/유치원) 우선. 일반(B2C) 전용 화면은 후순위.

## 하드 제약

- **BE/AI 코드는 건드리지 않는다.** 이번 범위는 프론트엔드뿐.
- **API 계약 기준은 실 BE다**(오리진 `https://api.cheese-moa.com` — Cloudflare 경유 HTTPS(CHMO-260), EC2 직통 IP는 보안그룹으로 차단, 스웨거 `/v3/api-docs`) — `docs/api-spec.md`와 안 맞는 부분은 **FE를 BE에 맞춘다**. BE 규약: 성공/실패 모두 `{isSuccess, code, message, result}` 봉투 · 숫자 ID(int64) · 경로에 `/api/v1` 프리픽스 없음(vite 프록시가 rewrite) · 시각이 오프셋 없는 UTC(CHMO-205 전까지 FE 보정). 봉투·에러 코드·시각 차이는 `src/api/client.ts`·`src/api/errors.ts`가, 리소스 필드명(`groupId`≠`id`·`eventDate`·`thumbnailUrl`·`personName`)·대문자 enum·서버가 주지 않는 파생값(특수 앨범 표시명·`visibleToViewer`·원본 `url`)은 `src/api/mappers.ts`+도메인 모듈이 흡수한다(CHMO-192) — 화면 코드는 봉투도 BE 필드명도 모른다. 매퍼의 절반은 단순 개명이라 **CHMO-201(BE DTO 필드명 정렬) 확정 후 걷어낼 수 있다** — 그 전엔 움직이는 과녁이라 유지한다. **리프레시 토큰(CHMO-193) 완료** — accessToken(만료 1시간) 401 시 `src/api/client.ts`가 refreshToken으로 1회 자동 재발급(회전 저장·in-flight promise 공유) 후 원 요청 재시도, 실패(TOKEN401) 시 두 토큰 삭제·로그인 복귀. 로그아웃은 `POST /auth/logout`(auth 미첨부, body `{refreshToken}`)으로 서버 무효화 후 로컬 삭제(`src/lib/auth.ts`가 두 토큰 저장 소유). **계약 테스트(CHMO-219) 완료** — 실 BE 응답 픽스처로 봉투·시각 보정·401 재발급·매퍼를 고정했다(`npm run test`). **에러 코드는 실서버에서 채집된 것만 목이 흉내 낸다**(COMMON401·AUTH400/401·TOKEN401·JOIN403·MOMENT404·ALBUM404·PHOTO400/404·VALID400). 미채집 케이스(모임 404·닉네임 중복·이미 멤버·미검토 공개 409)는 FE 의미 코드를 그대로 두고 `// BE 코드 미확인` 주석을 단다 — `errors.ts`가 미지 코드를 통과시키므로 화면은 동작하고, 추측한 코드를 BE 진실 테이블에 굳히지 않는다. 남은 몫: CHMO-196(문서 갱신 — 목이 구현한 계약이 곧 갱신본).
- **BE 결함 4건은 FE가 우회하지 않는다**(CHMO-194 착수 중 발견, BE 티켓 발행): 사진 추가 시 기존 사진·앨범·검수 상태가 전부 삭제됨(CHMO-215 — `ProcessClassifyResultUseCase`가 job 결과로 이벤트 전체를 갈아끼움) · 공개 이벤트에 사진 추가 시 `published` 해제(CHMO-216) · 요청당 50장 상한이라 200~300장 경로 없음(CHMO-217 — 쪼개 보내면 215가 발동해 마지막 배치만 남음) · 분석 실패가 `EMPTY`로 되돌아가 미시작과 구분 불가(CHMO-218). **첫 업로드(빈 이벤트·50장 이하)는 정상**이라 06-U는 동작한다.
- FE 개발 기본은 여전히 **MSW 목**(`VITE_ENABLE_MSW=true`) — 실 BE 확인 시 `false`로 끄면 프록시 경유. 실 BE 테스트 계정: `FE연동테스트`/PIN `0709`.
- MVP 제외: 결제/요금제, 다운로드 한도, 휴지통, 인물 병합, 학부모 로그인.

## 기술 스택

React 18 + Vite 5 + TypeScript(모바일웹, 기준 프레임 390×844) · 라우팅 react-router v6 · 스타일링 **Tailwind CSS v3**(토큰은 `tailwind.config.js` + `src/index.css`) · 데이터패칭 커스텀 `useApi` 훅 · API 목 레이어 **MSW**(`VITE_ENABLE_MSW=true`일 때만 활성 — 전 엔드포인트를 **실 BE 계약대로** 구현, CHMO-195). MSW를 끄면 `/api/v1` 요청이 vite dev 프록시로 실 BE에 전달된다(`VITE_API_ORIGIN`, 기본 `https://api.cheese-moa.com` — CHMO-191·260). 테스트는 **Vitest**(`vitest.config.ts`, node 환경 — jsdom·RTL 없음): 범위는 `src/api/`·`src/lib/` **계약 테스트**와 `src/mocks/serializers.test.ts` **이음매 테스트**뿐이고 화면 테스트는 의도적으로 제외한다(CHMO-219·195).

### 코드 구조 (`src/`)
- `main.tsx` 진입(+MSW 부트스트랩) · `router.tsx` 전 라우트 정의 · `index.css` Tailwind+디자인 토큰.
- `components/` PhoneShell(390×844 프레임)·BrandHero·AuthCredentialsForm(인증 화면 공용, returnTo 복귀 지원)·JoinGroupModal(02-1 참여 모달 — 홈·초대 링크 공용)·GroupShareSheets(InviteSheet·ParentShareSheet — 05 위 초대/학부모 공유 바텀시트, CHMO-112)·PhotoLightbox(사진 크게 보기 공용 라이트박스 — 09 검수·16 뷰어, iOS 사진 앱풍 라이트 크롬(흰 배경·상단 ✕/카운터·하단 아이콘 툴바)·좌우 스와이프·개별 저장 + info/actions 슬롯, CHMO-242) · `components/ui/` **공용 컴포넌트 세트**(CHMO-107: Header·Button(+ButtonLink)·Badge·Toggle·EmptyState·카드류·PhotoTile/Grid·Modal·BottomSheet·ConfirmDialog·Toast + TextField(CHMO-110) + ErrorState·PinField(CHMO-118: ErrorState = useApi 실패 공용, 401 `unauthorizedTo` 복귀·404 `notFoundTo` 돌아가기 CTA / PinField = 4자리 PIN 입력 공용) + LoadState(CHMO-181 — useApi 로딩/에러 폴백 공용: loading이면 로딩 문구, error면 ErrorState, 둘 다 아니면 null) + icons(SF Symbols풍 라인 아이콘 IconDownload·IconTrash·IconFolderMove·IconClose — currentColor, 라이트박스·09 선택모드·16 다운로드 버튼 공용, CHMO-242) — 데모 `/dev/components`, DEV 전용) · `guards/` 제작자/뷰어 라우트 가드 · `pages/`(+`pages/viewer/`) 화면 — 인증 01·01-1·01-2(CHMO-110)·모임 진입 02·03·02-1(CHMO-111)·모임 허브 05(CHMO-112, 초대는 시트라 별도 페이지 없음)·이벤트 06-M(05 위 모달)·06-E/분석중(EventDetailPage 상태 분기)·06-U(PhotoUploadPage, CHMO-113)·08 앨범 그리드(EventDetailPage 안 EventAlbumGrid + ⚙ 이벤트 설정 = RenameModal(이름 수정)+이벤트 삭제, CHMO-114·278)·09 앨범 상세(AlbumDetailPage 선택모드·삭제, CHMO-114)·설정(SettingsPage — GET/PATCH /me + 로그아웃, CHMO-118)·404(NotFoundPage) 포함 전 화면 실 UI.
- `api/` **API 계층**(CHMO-191·192·193) — `client.ts`(fetch 래퍼: 실 BE 봉투 `result` 언랩·시각 'Z' 보정 + 제작자 401 시 refreshToken 1회 자동 재발급 후 재시도(`/auth/refresh` 경로 소유 — transport 인프라) + 뮤테이션 401 공용 `redirectIfUnauthorized`)·`errors.ts`(BE 에러 코드→FE 의미 코드 매핑, 미지 코드는 통과)·**도메인 모듈** `auth.ts`·`groups.ts`·`events.ts`·`albums.ts`·`viewer.ts`(엔드포인트 함수 — 경로·바디·응답 변환 소유, 화면은 이것만 호출)·`mappers.ts`(BE DTO→FE 타입 변환 — 내부 전용, 화면에서 import 금지) · `lib/` `auth.ts`(제작자 토큰 — accessToken+refreshToken 저장·삭제 단일 소유, CHMO-193)·`viewer.ts`(뷰어 토큰 + 모임명 캐시 — BE는 모임명을 unlock 응답에만 준다)·`clipboard.ts`(복사 헬퍼)·`download.ts`(blob 저장 헬퍼 — 교차 출처 download 무시·서비스워커 우회 함정 회피, CHMO-242)·`pin.ts`(4자리 PIN 규칙 단일 원천 — UI·목 공유)·`albumLabels.ts`(특수 앨범 표시명 단일 원천 — UI·목 공유, CHMO-192)·`upload.ts`(업로드 제약 단일 원천 — 확장자 화이트리스트·20MB·50장, UI·목 공유, CHMO-194)·`concurrency.ts`(S3 PUT 동시 실행 수 제한) · `hooks/` `useApi.ts`(**`useApi(key, fetcher)`** — key가 요청 정체성, fetcher는 도메인 함수에 signal만 전달)·`useAlive.ts`(언마운트 후 늦은 응답 차단)·`useMutation.ts`(뮤테이션 공용 스켈레톤 — unmount 가드+401 리다이렉트+에러 메시지 정규화 소유, handle\*엔 성공/실패 후속만 남긴다; busy/성공/에러표시는 호출부 소유라 회귀 없음, CHMO-181) · `types/api.ts`(API 계약 타입 — `ID = number`, 라우트 파라미터는 도메인 함수가 `ID | string`으로 받아 경로에 그대로 쓴다).
- `test/` **테스트 하네스**(CHMO-219) — `setup.ts`(node용 localStorage + 테스트 간 토큰 격리)·`http.ts`(fetch 스텁·응답 빌더)·`fixtures/be.ts`(**실 BE 응답 원문** — 2026-07-10 채집분 + 스웨거 스키마 기준분, 시크릿은 치환). 테스트는 대상 옆에 둔다(`src/api/*.test.ts`·`src/lib/*.test.ts`·`src/mocks/serializers.test.ts`). **MSW를 HTTP 서버로 쓰지 않는다** — 목이 목을 검증하는 꼴이다. 두 테스트가 지키는 건 서로 다르다: `contracts.test.ts` = "매퍼가 **실 BE**와 말이 통하는가"(BE 픽스처), `mocks/serializers.test.ts` = "목과 매퍼가 서로 말이 통하는가"(tsc는 이 둘을 잇지 못한다 — 목이 `id`를 주고 매퍼가 `albumId`를 읽어도 빌드는 통과한다).
- `mocks/` **MSW 목 레이어**(CHMO-108·109, BE 계약 이행 CHMO-195) — `db.ts`(인메모리 스토어·상태머신·증분 분석·다대다 — `personNameOf`는 인물만 이름을 주고 특수 앨범은 null, BE와 동일) · `fixtures.ts`(시드 — 호출마다 새 객체) · `persist.ts`(가입 계정 localStorage 보존) · `handlers/`(auth·groups·events(+검수요약/공개)·albums(검수)·share(학부모 뷰어) + `shared.ts` 봉투 헬퍼(`ok`/`created`/`errorResponse`)·검증 헬퍼(`toId` 경로/본문 id 정규화 포함)·`serializers.ts`(**BE DTO 직렬화** — 함수명이 BE DTO를 따른다(`toAlbumSummary`≠`toAlbumDetail`), 목록/상세가 다른 필드를 주는 것까지 BE 그대로. 뷰어 필터링 포함)). 시드 ID는 숫자(모임 1~3·이벤트 1~4·앨범 1~12·사진 101/201/301대, 신규 발급 1001~ — CHMO-191). 업로드 3단계도 BE 계약대로 구현(CHMO-194): presign은 사진을 만들지 않고 `originals/events/{id}/{uuid}.{ext}` 키만 발급, 가짜 S3 PUT(`/mock-s3/*`)이 `db.uploadedKeys`에 기록, 등록(`POST /events/:id/photos`)이 사진 생성 + 분석 시작을 맡는다(PUT 안 한 키는 404). 시드 로그인: 이현정/1234 · 학부모 공유 시연: `/share/shr_grp1`, 비번 7421.

## 작업 방식

- **애매하면 추론하지 말고 사용자에게 묻는다.** (사용자 명시 선호)
- 사용자·문서는 한국어 — **한국어로 응답**한다.
- 화면 작업 시 와이어프레임을 Figma MCP로 확인: file `pcgDOk6iZYtuUEhKhaPWPM`, page `211:1311`. 화면별 노드 id는 `docs/screen-spec.md` 매핑표 참조.
- **브랜치·커밋 규칙**: `docs/convention.md` 준수 — Git Flow(`main`/`develop`/`feature`/`release`/`hotfix`), 커밋 메시지는 `[CHMO-###] type: 메세지` 형식.
- **스토리 작업 흐름**: 착수는 `/start-story CHMO-###`(Jira SP·상태 세팅 + `develop` 기준 `feature/CHMO-###-*` 브랜치), 마무리는 `/finish-story`(커밋·푸시·`develop` 대상 PR 생성까지). **머지·브랜치 정리·Jira '완료' 전환은 사용자가 수동으로** 한다(스킬은 체크리스트만 안내). `main`·`develop` 직접 커밋/푸시는 가드 훅이 차단한다. 담당자·상태는 Jira에서 직접 지정한다. 백로그는 Jira 프로젝트 `CHMO`(에픽 CHMO-96~105 / 스토리 CHMO-106~. 실연동 후속: 192 엔드포인트 계층 추출·193 리프레시 토큰(완료)·194 업로드 3단계·195 목 이행·196 API 문서 갱신).

## 미확정 결정 (임의로 정하지 말 것 · 상세 `docs/screen-spec.md` §5)

홈 관리자 배지 표시 여부 · 품질 제외 사진 라우팅(눈감음/흔들림 앨범) · 공통(common) 앨범 정의. (학부모 공유 = 모임 단위로 **확정**됨.)

## 명령어

- `npm run dev` — 개발 서버(Vite, 기본 5173) · `npm run build` — 타입체크(`tsc --noEmit`)+프로덕션 빌드 · `npm run preview` — 빌드 결과 미리보기.
- `npm run typecheck` · `npm run lint` — 검사 · `npm run test`(=`vitest run`)/`test:watch` — **api 계층 계약 테스트**(CHMO-219).
- Prettier: `npm run format`(쓰기)/`npm run format:check`(검사). **주의**: 리포에 기존 CRLF/포맷 잔재가 있어 `format:check`는 클린 체크아웃에서도 실패한다 — 통과/실패 신호로 쓰지 말 것. `format` 전체 실행도 무관 파일까지 재포맷하므로 커밋 전엔 스토리 파일만 스테이징한다.

**워크플로우 스킬**(`.claude/skills/`):
- `/start-story CHMO-###` — 스토리 시작: SP 추천·설정, 상태 '진행 중', `feature/CHMO-###-<slug>` 브랜치 생성.
- `/test-guide` — 현재 브랜치 변경분 기준 테스트 가이드 생성: 자동 검증(typecheck·lint·build) 실행 + "진입 경로 → 조작 → 기대 결과" 수동 체크리스트.
- `/finish-story` — 커밋·푸시·PR 생성(테스트 가이드 포함) + Jira PR 코멘트(best-effort). 머지·브랜치 정리·Jira '완료'는 사용자가 수동으로(스킬은 체크리스트만 안내).
- `/bug-briefing` — 버그·코드리뷰 결함을 "무슨 코드 → 언제 터지나 → 왜 그렇게 됐나 → 어떻게 고치나" 4단 형식 + 코드 위치 링크 + 요약 표로 브리핑.

**가드 훅**(`.claude/settings.json` → `.claude/hooks/`): `main` 직접 commit/push 차단, commit/push 전 typecheck·lint·test(스크립트 정의 시) 실행.
