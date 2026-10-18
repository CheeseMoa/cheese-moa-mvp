# CHMO-953 초대 진입·설치 복귀 검증

2026-10-18 기준. 서명·복귀 흐름에 CHMO-888 현지화까지 함께 진행한다는 최종 사용자 결정을 반영한다. ko/en/ja 웹 검증은 `CHMO-888-public-localization.md`를 함께 본다. 클릭 추적/캠페인(CHMO-857 B)은 해당 작업 이후 통합 검증한다. AppsFlyer·설치 후 자동 참여는 이번 범위에 포함하지 않는다.

## 서명과 운영 응답

`com.cheesemoa.app`에 등록할 지문은 다음 네 개다. dev 패키지는 등록하지 않는다.

| 구분 | SHA-256 |
|---|---|
| 새 Play 앱 서명 | `6D:0C:F9:BE:0B:2E:FB:8A:D3:AF:FD:79:62:9F:98:65:B7:F4:2F:BA:D6:A0:7A:07:34:F6:12:A0:AA:41:2D:4D` |
| 기존 Play 앱 서명 | `A3:2F:EC:4D:E1:BD:1A:2D:2D:B4:08:0B:D9:68:A2:4A:79:1F:51:8F:E8:2E:B7:AE:B8:62:AF:F1:69:46:2D:1E` |
| 업로드 키 / 로컬 release | `2C:28:43:50:95:7E:38:3B:04:C2:D2:35:4F:EF:05:19:97:E4:06:75:AC:3D:D2:95:88:FE:B1:0F:A9:20:6E:08` |
| 개발 debug | `BE:2B:3B:DD:AC:78:09:6E:D6:42:B5:97:C3:BD:06:C4:05:15:63:EA:03:B0:81:12:08:18:B3:AA:97:3D:6E:4F` |

- 출처: 앱 저장소 `docs/release-guide.md` §3의 2026-10-16 Console 기록과 Jira CHMO-953이 일치한다.
- **Console 현재값 재확인 미완료**: 조회를 시도한 로그인 계정에서 앱이 아닌 개발자 계정 가입 화면으로 연결됐다. 실제 앱의 앱 서명 페이지에서 새/이전 지문을 다시 확인해야 한다.
- **변경 전 운영 확인**: `https://app.cheese-moa.com/.well-known/assetlinks.json`은 HTTP 200, JSON, 패키지 일치. 기존 3개만 있고 새 지문이 없다. 응답 캐시는 `public, max-age=0, must-revalidate`, `x-vercel-cache: MISS`였다.
- **변경 전 Digital Asset Links**: statements 응답은 기존 3개만 포함, `maxAge` 약 3600초. 이는 새 지문 검증 통과가 아니다.
- **운영 배포 후 검증 미실행**: 이 작업 브랜치의 수정은 운영 배포 완료를 뜻하지 않는다. 운영 배포 후 아래 두 응답에 네 지문이 모두 있는지 확인한다. CDN/DAL 캐시가 남으면 `maxAge` 이후 다시 확인한다.

```bash
curl -i https://app.cheese-moa.com/.well-known/assetlinks.json
curl 'https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://app.cheese-moa.com&relation=delegate_permission/common.handle_all_urls'
```

## 웹 자동·브라우저 검증

- **통과**: Node 20.20.2에서 `npm run verify` — typecheck·lint·Vitest 34개 파일/522개 테스트·production build.
- `appOpenAttempt.test.ts`: 무응답·재시도·스킴 거부·화면 숨김·pagehide·BFCache pageshow·직접 스토어 이동·언마운트 후 정리. 시간 경과로 스토어 이동이 발생하지 않음을 검사한다.
- `inAppBrowser.test.ts`: 카카오톡·인스타그램·일반 브라우저와 앱 UA 우선순위.
- 로컬 `/join/QA1234?type=general&name=테스트모임`에서 긴 모임명, 320px/390px 화면, 스크롤, 키보드 포커스, 링크·코드 복사, 도움말을 확인한다. `role=viewer`와 혼합 대소문자 키에서는 코드 복사가 없어야 한다.
- 이 화면은 API를 호출하지 않으며 MSW가 필요 없다. 로컬 화면·UA 시뮬레이션은 실제 앱 실행이나 실 BE 참여 성공의 증거가 아니다.

### 이번 로컬 확인 결과

- Chrome 390×844, Android/인스타그램 UA 시뮬레이션: 긴 모임명 줄바꿈, Play 링크, 초대 링크 복사 성공. 문서와 main의 가로 폭이 모두 390px로 넘침 없음. 조작 영역 높이 44px 이상.
- Chrome 320×568, iOS/카카오톡·viewer UA 시뮬레이션: Safari 안내·App Store 링크, 코드 복사 미노출. 클립보드와 레거시 복사를 차단한 QA에서 직접 복사 입력란 표시 및 전체 선택(127자) 확인. main의 가로 넘침 없음.
- 도움말 펼침으로 로그인·이미 참여·만료·스토어 실패 안내 확인. 직접 복사 입력란에서 Tab 이동 시 도움말에 키보드 포커스와 기본 outline 표시.
- 실제 React Router `/join/QA1234` 데스크톱 진입: 휴대폰 안내와 스토어 2개, 복사 경로 확인.
- 테스트용 UA/클립보드 하네스는 확인 후 제거했고 제품 코드에 넣지 않았다. MSW·통계 전송을 끈 로컬 서버에서 확인했다.
- 저장소와 production build의 assetlinks JSON에서 네 지문을 확인했고, 기존 세 지문이 모두 유지됨을 비교했다.

## 실기기 확인 — 미실행

Android 새 Play 서명·기존 Play 서명·debug APK를 각각 별도 행에 기록한다. 기존 설치본을 지우거나 다른 서명 APK로 덮어쓰지 말고 별도 기기/프로필로 보존한다. Android 13+에서 **Play 또는 내부 테스트 트랙 설치본**을 사용하고, 앱 버전·설치 경로·실제 APK 서명·OS를 기록한다. 로컬 debug의 성공을 Play 설치본 검증으로 대체하지 않는다.

| 설치본 / 환경 | 시작 상태 | 조작 | 기대 결과 | 결과 |
|---|---|---|---|---|
| Android 13+ 새 Play 키 | 앱 설치, 로그인 | 실제 초대 HTTPS 링크 탭 | 앱 → 해당 모임 참여 화면 | 미실행 |
| 기존 Play 키 설치본 | 앱 설치 | 같은 초대 HTTPS 링크 탭 | 기존 서명에서도 앱 착지 유지 | 미실행 |
| 로컬 debug APK | 앱 설치 | 같은 초대 HTTPS 링크 탭 | debug 경로 별도 확인 | 미실행 |
| iOS Safari / Android Chrome | 미설치 | 스토어 설치 → 로그인 → 받은 초대 재탭 | 원래 모임으로 진입, 자동 참여 약속 없음 | 미실행 |
| iOS / Android 카카오톡·인스타그램 | 설치/미설치 각각 | 앱 열기·취소·외부 브라우저 열기·스토어 이동/복귀 | 안내·재시도·링크 복사 유지, 무한 대기 없음 | 미실행 |
| iOS / Android | 로그아웃 | 앱 열기 → 로그인 → 초대 재탭 | 초대 흐름 계속 가능 | 미실행 |
| iOS / Android | 이미 참여한 계정 | 초대 열기 → 모임 목록 확인 | 기존 모임 접근 가능 | 미실행 |
| iOS / Android | 잘못된/만료된 초대 | 앱 열기 → 실패 안내 | 새 초대 요청 동선 이해 가능 | 미실행 |

지원 기기에서 App Links 진단:

```bash
adb shell pm verify-app-links --re-verify com.cheesemoa.app
adb shell pm get-app-links com.cheesemoa.app
# verified 도메인 확인 후 실제 테스트 초대 URL을 사용한다.
adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d '<실제 테스트 초대 HTTPS URL>'
```

초대 URL·토큰·비밀번호·사용자 식별자는 분석 도구나 공개 검증 로그에 남기지 않는다. 최종 AC는 운영 반영·Console 현재값·실기기·선행 티켓 통합 검증까지 별도로 확인한다.
