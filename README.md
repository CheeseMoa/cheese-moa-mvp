# 치즈모아 (cheese-moa-mvp)

유치원 행사 사진을 AI가 아이별 앨범으로 자동 분류 → 선생님이 검수 → 이벤트별 공개 → 학부모가 링크+비밀번호로 무로그인 조회·다운로드하는 **모바일웹**(MVP).

- 기준 프레임: **390 × 844**
- 스택: React 18 + Vite + TypeScript · react-router v6 · Tailwind CSS v3 · API 목 레이어 MSW
- 소스 오브 트루스: [`docs/`](./docs) (기능·화면·API 명세)

## 개발

```bash
npm install
npm run dev          # 개발 서버 (http://localhost:5173)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # 타입체크 + 프로덕션 빌드
```

### MSW (목 API)

`POST/GET …` 등 API 호출은 MSW 목 핸들러로 처리한다(BE 미구현). 기본 비활성이며,
`.env`에 `VITE_ENABLE_MSW=true`를 두면 부트스트랩된다(핸들러는 후속 스토리에서 추가).

## 디렉터리

```
src/
  main.tsx            앱 진입 + MSW 부트스트랩
  router.tsx          전체 라우트 정의
  index.css           Tailwind + 디자인 토큰(CSS 변수) + 치즈 도트 유틸
  components/         PhoneShell(390×844 프레임), 화면 스텁 헬퍼
  guards/             제작자/뷰어 라우트 가드
  pages/              화면별 스텁 (screen-spec 매핑)
  lib/                api 클라이언트 · 토큰 저장(auth/viewer)
  hooks/              useApi
  types/              api.ts (API 계약 타입)
  mocks/              MSW 부트스트랩 자리
```
