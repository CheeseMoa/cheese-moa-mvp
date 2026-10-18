# CHMO-888 외부 페이지 현지화 검증·운영 URL

2026-10-18 사용자 결정: 8 SP, CHMO-953과 함께 develop 머지. 영어 폴백, 기존 `/get/en` 보존. 법적 문서는 CHMO-889의 확정본 전달 전 한국어 원문을 유지한다. 이 문서는 운영 배포·스토어 등록 완료 증빙이 아니다.

## 이번 변경

- `/join/*`, 삭제 안내 2종, `/support`, 404: 한국어·영어·일본어.
- `?lang=ko|en|ja` 우선, 없거나 미지원이면 브라우저 선호 목록의 첫 지원 언어, 전부 미지원이면 영어. 지역 태그(en-US, ja-JP) 지원.
- 언어 전환이 이름·초대 키·비밀번호·역할·UTM·해시를 보존한다. 사용자 입력을 HTML로 해석하지 않는다.
- 문구·공식 스토어 배지·html lang·SPA 메타가 언어에 맞춰 바뀐다. i18next는 외부 페이지 청크에만 포함된다. 외부 페이지 이탈 시 메타·html lang 복원.
- 법적 본문·동의 버전은 변경하지 않았다. en/ja는 한국어 제공 안내와 `lang=ko` 원문. 번역이 없는 법적 본문에 en/ja 대체 문서 메타를 붙이지 않는다.
- `PublicMetadata`는 클라이언트 메타다. JS를 실행하지 않는 공유 봇은 기존 index.html 기본값을 본다. 초대 키/쿼리는 메타에 복제하지 않는다.
- 번역 용어·브랜드 기준: 앱 `docs/app-architecture.md` §6-l. 삭제 안내는 `src/legal/deletionGuides.ts`의 구조·정책·버전을 그대로 번역한다. 원어민 검수는 CHMO-889 후속이다.

## 자동 검증

- Node 20, `npm run verify`: typecheck·lint·34개 파일 522개 Vitest·production build 통과.
- 언어 우선순위, 비지원 폴백, URL 보존, 세 언어 키·보간 변수 정합, 언어 인스턴스 격리, 삭제 안내 구조·버전 일치.
- CHMO-953의 앱 열기 타이머·재시도·복귀 이벤트와 브라우저 판정 검증 포함.
- 별도 랜딩: `node --test get/test/*.test.mjs`, 7개 통과. 언어/리다이렉트 캐시, 기존 영어 경로 고정, UTM·스토어 referrer·이벤트 언어 유지, 정적 메타·배지 확인.

## 화면 확인 방법

실행: `npm run dev` → `http://127.0.0.1:5173`. MSW 불필요. 샘플 초대는 실제 참여용이 아니다.

- [x] `/join/QA1234?type=general&name=Friends&lang=en` → 日本語 선택 → 모임명/키는 유지, 안내·배지·복사/재시도 문구만 일본어.
- [x] 일본어 브라우저 모의 환경에서 `lang` 없는 초대 → 일본어 자동 선택. 320px iOS/카카오톡 모의 환경 → Safari 안내, App Store 일본어 배지, 복사 차단 시 일본어 수동 복사 안내. 가로 넘침 없음.
- [x] `/account-deletion?lang=ja` → 개인정보 링크 → `lang=ja` 유지, 한국어 원문 제공 안내 + 실제 한국어 본문·기존 버전 유지.
- [x] 영어 Android/Instagram 모의 환경: 브라우저 언어 자동 선택, Chrome 안내, Play 영어 배지, `A&B Friends` 이름 보존, 320px 가로 넘침 없음.
- [x] 법적 문서 → 요금 안내로 이동 → 한국어 html lang 복원, 외부 페이지용 메타 제거.
- [x] `/support?lang=en` → 삭제 안내 링크 → 선택 언어 유지. 메일 버튼은 기존 지원 주소로 연결(실제 발송하지 않음).
- [x] `/unknown?lang=ja` → 일본어 404·한국어 홈 이동.
- [x] 랜딩 `/get/ja?utm_source=ig&utm_medium=paid&utm_campaign=test` → English → 기존 `/get/en` 사진·스크린샷 구성 유지, UTM 보존, App Store `get_en_instagram_ad`·Play `get_en_test` 확인.

브라우저 UA/클립보드 모의 하네스는 확인 후 제거한다. 이는 실제 기기 설치·실 BE 참여의 증거가 아니다. 실기기·Console·운영 서명 검증은 CHMO-953 가이드를 따른다.

## 운영에 전달할 URL (운영 배포 후 사용)

| 목적 | 한국어 | 영어 | 일본어 |
| --- | --- | --- | --- |
| 개인정보 처리방침 | https://app.cheese-moa.com/legal/privacy?lang=ko | https://app.cheese-moa.com/legal/privacy?lang=en | https://app.cheese-moa.com/legal/privacy?lang=ja |
| 고객 지원 | https://app.cheese-moa.com/support?lang=ko | https://app.cheese-moa.com/support?lang=en | https://app.cheese-moa.com/support?lang=ja |
| 계정 삭제 | https://app.cheese-moa.com/account-deletion?lang=ko | https://app.cheese-moa.com/account-deletion?lang=en | https://app.cheese-moa.com/account-deletion?lang=ja |
| 데이터 삭제 | https://app.cheese-moa.com/data-deletion?lang=ko | https://app.cheese-moa.com/data-deletion?lang=en | https://app.cheese-moa.com/data-deletion?lang=ja |
| 앱 받기 | https://cheese-moa.com/get?lang=ko | https://cheese-moa.com/get/en | https://cheese-moa.com/get/ja |

약관·얼굴 특징정보도 `/legal/terms?lang=…`, `/legal/biometric?lang=…`를 쓴다. 법적 본문 영어·일본어 URL은 현재 **해당 언어의 안내 + 한국어 원문**이며 번역 완료/해외 법무 승인으로 전달하면 안 된다. 스토어 콘솔 URL 입력과 원어민·법무 검수는 미실행이다.
