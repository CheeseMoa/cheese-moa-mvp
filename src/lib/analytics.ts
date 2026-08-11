/**
 * 사용자 행동 추적 (CHMO-660) — Amplitude 얇은 래퍼. 화면·훅은 이 모듈만 본다.
 *
 * 도구를 감싸는 이유는 교체 가능성이 아니라 **안전장치를 한곳에 모으기 위해서**다.
 * 이 앱은 아동 얼굴 사진을 다루고 URL에 열쇠가 박혀 있어서, 분석 도구의 기본값을
 * 그대로 쓰면 새어 나가는 것이 생긴다. 그 방어가 전부 여기 있다 —
 *
 * ① **실제 URL을 절대 보내지 않는다.** `/share/:token`은 그 토큰 하나로 모임 사진을
 *    열람할 수 있고(뷰어 잠금 해제 토큰), `/join/:joinKey`는 초대 코드, `/auth/callback`의
 *    `?code=`는 로그인 일회용 코드다. URL을 그대로 실으면 분석 대시보드를 볼 수 있는
 *    사람이 곧 사진을 볼 수 있는 사람이 된다. 그래서 자동 페이지뷰(pageViews)를 끄고
 *    아래 화이트리스트에 **매칭된 패턴만** 보낸다. 목록에 없으면 URL이 아니라
 *    `unknown`으로 떨어뜨린다 — 새 라우트가 생겨도 값이 새지 않는 쪽으로 실패한다.
 *
 * ② **자동 클릭 캡처(elementInteractions)를 끈다.** 켜면 SDK가 클릭한 요소의 텍스트를
 *    함께 수집하는데, 이 앱에서 그건 앨범 이름 = 인물 실명이다.
 *
 * ③ **익명이다.** 로그인 userId를 붙이지 않는다(`setUserId` 미호출). 화면별 이탈률은
 *    익명 기기 단위로도 그대로 보이고, 개인을 특정하지 않는 편이 고지 부담이 훨씬 가볍다.
 *
 * ④ **쿠키를 쓰지 않는다.** SDK 기본값은 기기 식별자를 쿠키에 넣지만 localStorage로 돌렸다.
 *    IP 수집도 끈다(지역 추정용인데 국내 한정 서비스라 얻는 게 없다).
 *
 * ⑤ **세션 리플레이(화면 녹화)는 도입하지 않는다.** 별도 플러그인이라 기본으로 켜지지
 *    않지만, 켜는 순간 아이 얼굴 사진이 그대로 제3자 서버에 녹화된다. 이 파일에 그
 *    플러그인을 추가하지 말 것.
 *
 * **키가 없으면 완전 no-op다** — `VITE_AMPLITUDE_API_KEY` 미설정 빌드는 SDK를 초기화조차
 * 하지 않아 네트워크 요청이 0건이고, 기존 동작과 완전히 같다. 그래서 키를 넣기 전까지
 * 이 코드가 배포돼 있어도 무해하다.
 *
 * ⚠ **키 투입은 개인정보 고지 개정과 세트다.** 처리방침 §11(자동 수집 장치)이 현재
 * "쿠키 등 이용자를 자동으로 식별하는 장치를 사용하지 않습니다"로 고지돼 있다(CHMO-656에서
 * 법정 필수 기재로 신설). 키를 넣는 순간 이 문장이 사실과 달라지므로, 키 투입 배포와
 * 같은 시점에 §11(수집 항목·목적·거부 방법)·§8(위탁 표)·§9(국외 이전 — Amplitude는 한국
 * 리전이 없다)을 함께 고쳐야 한다. 문서 version 인상은 BE `AgreementType`과 함께여야
 * 한다는 제약이 따로 있다(FE 단독 인상 시 가입 동의 제출이 전부 VALID400).
 */
import { nativeAppInfo } from '../native/bridge'

const API_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY as string | undefined
/** Amplitude 프로젝트를 EU 리전으로 만들었다면 'EU' — 안 맞으면 이벤트가 조용히 버려진다 */
const SERVER_ZONE = (import.meta.env.VITE_AMPLITUDE_SERVER_ZONE as string | undefined) === 'EU' ? 'EU' : 'US'

/**
 * 추적하는 화면 목록 — 라우트 패턴과 화면 코드의 단일 원천.
 *
 * 화면 코드는 `docs/screen-spec.md`의 화면 번호를 따른다. 분석 화면에서 "08에서 이탈"처럼
 * 우리가 평소 쓰는 말로 읽히게 하려는 것이고, 경로를 그대로 쓰면 같은 라우트에 여러 화면이
 * 걸린 곳(06-E·분류중·08이 한 라우트)을 구분해 부를 수 없다.
 *
 * ⚠ **순서가 의미를 갖는다** — 세그먼트 수가 같은 패턴은 위에서부터 먼저 맞는 것이 이긴다.
 * `/groups/new`가 `/groups/:groupId`보다 위에 있어야 모임 생성이 모임 상세로 집계되지 않는다.
 * ⚠ router.tsx에 라우트를 추가하면 여기도 추가한다(안 하면 `unknown`으로 모인다 — 값이
 * 새지는 않지만 그 화면이 분석에서 사라진다). 누락은 `analytics.test.ts`가 잡는다.
 */
const SCREENS: ReadonlyArray<readonly [pattern: string, screen: string]> = [
  // 인증·진입
  ['/', '01-landing'],
  ['/login', '01-landing'],
  ['/auth/callback', '01-C-social-callback'],
  ['/consent', '01-A-signup-consent'],
  ['/join/:joinKey', '02-1-join'],
  ['/onboarding', '00-onboarding'],

  // 제작자 본류
  ['/home', '02-home'],
  ['/settings', 'settings'],
  ['/groups/new', '03-group-create'],
  ['/groups/:groupId', '05-group-detail'],
  ['/groups/:groupId/invites', '20-invite'],
  ['/groups/:groupId/events/:eventId', '08-event-detail'],
  ['/groups/:groupId/events/:eventId/upload', '06-U-upload'],
  ['/groups/:groupId/events/:eventId/publish', '14-publish-summary'],
  ['/groups/:groupId/events/:eventId/albums/:albumId', '09-album-detail'],

  // 멤버(학부모) 화면
  ['/parent/groups/:groupId', '18-member-group'],
  ['/parent/groups/:groupId/events/:eventId', '19-member-photos'],

  // 무로그인 뷰어 (이관 예정 — CHMO-449)
  ['/share/:token', '15-viewer-unlock'],
  ['/share/:token/events', '15-L-viewer-events'],
  ['/share/:token/events/:eventId', '15-viewer-albums'],
  ['/share/:token/events/:eventId/albums/:albumId', '16-viewer-photos'],

  // 약관·안내 (가드 밖 공개 URL)
  ['/legal/terms', 'legal-terms'],
  ['/legal/privacy', 'legal-privacy'],
  ['/legal/biometric', 'legal-biometric'],
  ['/account-deletion', 'legal-account-deletion'],
  ['/data-deletion', 'legal-data-deletion'],

  // 어드민·DEV — 집계에서 갈라내려고 이름을 붙여 둔다(빼면 unknown으로 섞인다)
  ['/admin', 'admin-dashboard'],
  ['/admin/groups', 'admin-groups'],
  ['/admin/groups/:groupId', 'admin-group-detail'],
  ['/dev/components', 'dev-components'],
  ['/dev/login', 'dev-login'],
]

/** 화이트리스트에 없는 경로 — URL을 대신 싣지 않는다(그게 이 값이 존재하는 이유다) */
export const UNKNOWN_SCREEN = 'unknown'

/**
 * 이벤트 이름 — 오타로 같은 뜻의 이벤트가 둘로 갈리지 않게 타입으로 묶는다.
 * 이름은 스토어·BE 용어가 아니라 **사용자 행동**으로 짓는다(무엇을 눌렀나).
 */
export type AnalyticsEvent =
  | 'screen_view'
  /** 소셜 로그인 버튼 탭 — 프로바이더별 이탈을 본다 */
  | 'login_start'
  /** 01-A 가입 동의 제출 = 가입 완료 */
  | 'signup_consent_submit'
  | 'group_create_success'
  | 'event_create_success'
  /** 06-U 업로드 완료 — 장수·중복 제외 수 */
  | 'upload_success'
  | 'upload_fail'
  /** 09 [검토 완료] — 검토 동선이 앨범 수만큼 반복이라 이탈이 가장 의심되는 구간 */
  | 'album_review_complete'
  /** 14 [공개하기] 성공 */
  | 'publish_success'
  /** 20 초대 링크 복사·공유 */
  | 'invite_link_copy'
  | 'invite_share'
  /** 02-1·02-2 참여(신청) 제출 */
  | 'join_submit'
  /** 사진 저장 — 이 앱의 최종 가치가 도달하는 지점 */
  | 'photo_save'

/**
 * 이벤트 프로퍼티 — **개인정보를 절대 넣지 않는다.**
 * 금지: 이름(회원·인물·모임·이벤트·앨범)·사진 URL·초대 코드·이메일·자유 입력 원문.
 * 허용: 개수, 소요 시간, enum(모임 유형·역할·프로바이더·실패 단계), 불리언.
 * 식별자(groupId 등)도 넣지 않는다 — 분석에 필요 없고, 넣는 순간 특정 모임의 행동이 된다.
 */
export type AnalyticsProps = Record<string, string | number | boolean | undefined>

let initialized = false
/** 같은 화면 연속 기록 방지 — router.subscribe는 한 번의 이동에도 여러 번 불린다 */
let lastScreen: string | null = null

type AmplitudeModule = typeof import('@amplitude/analytics-browser')
/** 동적 import가 끝나야 채워진다 — 그전 이벤트는 큐로 받는다 */
let sdk: AmplitudeModule | null = null
/**
 * SDK 도착 전 이벤트 보관함. 앱 시작 직후의 첫 화면 진입이 가장 중요한 데이터인데
 * import가 끝나기 전에 발생하므로, 버리지 않고 모았다가 초기화 끝에 흘려보낸다.
 * 상한을 두는 건 로드가 영영 실패했을 때 큐가 무한히 자라지 않게 하려는 것.
 */
const pending: Array<[AnalyticsEvent, AnalyticsProps]> = []
const PENDING_MAX = 50

/** 키가 없으면 아무것도 하지 않는다 — 미설정 빌드에서 이 모듈은 순수 함수 몇 개일 뿐이다 */
function enabled(): boolean {
  return Boolean(API_KEY)
}

/**
 * 경로 → 화면 코드. 실제 경로 문자열은 여기서 끝나고 밖으로 나가지 않는다.
 * 세그먼트 수가 같고 `:param` 자리를 뺀 나머지가 전부 같아야 매칭이다.
 */
export function screenOf(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  for (const [pattern, screen] of SCREENS) {
    const segs = pattern.split('/').filter(Boolean)
    if (segs.length !== parts.length) continue
    if (segs.every((seg, i) => seg.startsWith(':') || seg === parts[i])) return screen
  }
  return UNKNOWN_SCREEN
}

/** 모든 이벤트에 붙는 값 — 앱 웹뷰와 브라우저의 행동이 섞이면 둘 다 안 보인다 */
function baseProps(): AnalyticsProps {
  const app = nativeAppInfo()
  return {
    surface: app ? 'app' : 'web',
    app_platform: app?.platform,
    app_version: app?.appVersion,
  }
}

/**
 * SDK 초기화 — main.tsx에서 1회. 키가 없으면 SDK를 **불러오지도** 않는다.
 *
 * 정적 import가 아니라 동적 import인 이유는 번들이다: SDK가 gzip 65KB인데 정적으로 걸면
 * 키를 안 넣어 아무 일도 하지 않는 빌드까지 그걸 받는다. 지금은 키 미설정 빌드의 메인
 * 청크가 도입 전과 같고(별도 청크로 갈라져 요청조차 안 나간다), 이건 `VITE_API_DIRECT`가
 * 미설정 빌드에서 바이트 동일을 지킨 것과 같은 기준이다(CHMO-573).
 *
 * 자동 수집은 세션 경계만 남긴다(이탈 분석의 기준선이고, 화면 내용을 읽지 않는다).
 */
export async function initAnalytics(): Promise<void> {
  if (initialized || !enabled()) return
  initialized = true

  const amplitude = await import('@amplitude/analytics-browser')
  amplitude.init(API_KEY as string, {
    serverZone: SERVER_ZONE,
    // 쿠키 대신 localStorage — 처리방침에서 쿠키 미사용을 유지하기 위한 선택
    identityStorage: 'localStorage',
    // IP는 지역 추정용인데 국내 한정 서비스라 얻는 게 없다 — 최소 수집 원칙
    trackingOptions: { ipAddress: false },
    autocapture: {
      sessions: true,
      // 아래는 전부 이 앱에서 켜면 안 되는 것들 — 이유는 파일 머리 주석 ①②
      pageViews: false,
      elementInteractions: false,
      formInteractions: false,
      fileDownloads: false,
      attribution: false,
    },
  })

  // 여기까지 와야 전송이 가능하다 — 로드 중에 쌓인 것부터 흘려보낸다(첫 화면 진입이 여기 있다)
  sdk = amplitude
  for (const [event, props] of pending) amplitude.track(event, props)
  pending.length = 0
}

/** 이벤트 기록. DEV에서는 콘솔로만 확인하고 전송하지 않는다(개발 트래픽이 지표를 흐린다). */
export function trackEvent(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!enabled()) return
  const payload = { ...baseProps(), ...props }
  if (import.meta.env.DEV) {
    console.info('[analytics]', event, payload)
    return
  }
  // SDK가 아직 안 왔으면 큐로 — 상한을 넘으면 버린다(로드가 영영 실패한 경우의 안전장치)
  if (!sdk) {
    if (pending.length < PENDING_MAX) pending.push([event, payload])
    return
  }
  sdk.track(event, payload)
}

/**
 * 화면 진입 기록. **경로가 아니라 화면 코드를 싣는다**(파일 머리 주석 ①).
 * 같은 화면이 연달아 들어오면 무시한다 — 한 번의 이동에 subscribe가 여러 번 불린다.
 */
export function trackScreen(pathname: string): void {
  if (!enabled()) return
  const screen = screenOf(pathname)
  if (screen === lastScreen) return
  lastScreen = screen
  trackEvent('screen_view', { screen })
}

/** 테스트 전용 — 모듈 전역(중복 방지 상태)을 초기화한다 */
export function __resetAnalyticsForTest(): void {
  initialized = false
  lastScreen = null
  sdk = null
  pending.length = 0
}
