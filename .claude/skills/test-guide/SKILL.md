---
name: test-guide
description: >-
  현재 브랜치 변경분을 분석해 "무엇이 바뀌었고, 어디로 들어가서, 뭘 확인하면 되는지" 테스트 가이드를
  만들어준다 — 실행 가능한 자동 검증 + 화면별 수동 확인 체크리스트. 사용자가 "/test-guide",
  "테스트 어떻게 해", "어디서 확인해", "확인 방법 알려줘"라고 요청할 때 사용.
  finish-story가 PR '테스트' 섹션을 채울 때도 이 절차를 따른다.
---

# test-guide — 이번 변경 테스트 가이드

브랜치 변경분을 훑어 (1) 돌릴 수 있는 자동 검증과 (2) 화면 진입 → 조작 → 기대 결과 형태의
수동 확인 체크리스트를 만들어 보여준다.

## 절차

1. **변경 파악** — `git diff --stat develop...HEAD` + 미커밋분(`git status --porcelain`, `git diff --stat`)을 합쳐 변경 파일을 수집한다. 커밋 전이면 워킹트리 기준.
2. **영향 화면 매핑** — 변경 파일을 "들어가 볼 곳"으로 변환한다:
   - `src/pages/**` → `src/router.tsx`의 라우트 경로 + `docs/screen-spec.md` 화면 코드(01, 02, 05…)와 Figma 노드.
   - `src/components/ui/**` → 데모 `/dev/components`(DEV 전용) + 실제 사용처(grep으로 어떤 페이지가 쓰는지 확인).
   - `src/components/**`(PhoneShell 등)·`src/lib/**`·`src/hooks/**` → 사용처 grep 후 대표 화면 1~2개.
   - `src/mocks/**` → 해당 핸들러를 소비하는 화면. **`VITE_ENABLE_MSW=true` 필요**를 명시.
   - `src/guards/**` → 가드 통과/차단 두 경로 모두 체크 항목으로.
3. **자동 검증** — 실행 가능한 것을 순서대로 돌리고 결과를 보고한다:
   - `npm run typecheck` → `npm run lint` → `npm run build`(프로덕션 번들 이상 유무).
   - 테스트 러너(vitest 등)는 **아직 미설정** — 도입 전까지 자동 검증은 위 3개가 전부임을 밝힌다.
4. **수동 확인 가이드 출력** — 아래 형식으로. 체크 항목은 반드시 **진입 경로 → 조작 → 기대 결과** 3요소를 갖춘다:
   ~~~
   ## 이번 변경 테스트 가이드
   **바뀐 것**: <1~2줄 요약>
   **실행**: npm run dev → http://localhost:5173/<대표 경로>   (MSW 필요 시 VITE_ENABLE_MSW=true 병기)

   **체크리스트**
   - [ ] <경로/화면> — <조작> → <기대 결과>
   - [ ] …

   **회귀 확인**: <변경이 스칠 수 있는 기존 화면 1~2개와 이유>
   ~~~
   - 시각 규칙(테두리 색·배지 톤 등)은 비교 기준(`docs/design/*.dc.html` 섹션 번호, Figma 노드 id)을 함께 적는다.
   - 가드 걸린 라우트(CreatorGuard/ViewerGuard)는 선행 조건(로그인/잠금해제)을 체크리스트 첫 항목으로 둔다.
   - DEV 전용 라우트(`import.meta.env.DEV`)는 프로덕션에서 안 보이는 게 정상임을 표시한다.
5. **(선택) 렌더 스모크** — 브라우저를 못 여는 상황이면 헤드리스 Edge로 스크린샷을 찍어 확인한다:
   `msedge --headless --disable-gpu --user-data-dir=<임시폴더> --virtual-time-budget=8000 --window-size=390,3400 --screenshot=<파일경로> <URL>`
   (Edge 경로: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`)

## 주의
- 가이드는 "다 확인하라"가 아니라 **이번 변경이 실제로 지나가는 경로**로 좁힌다. 항목 5~10개면 충분.
- dev 서버가 이미 떠 있으면 재사용하고, 포트(기본 5173)를 확인해 URL에 반영한다.
