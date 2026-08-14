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
 * ⑥ **수집 거부(옵트아웃)를 이 모듈이 소유한다**(CHMO-662) — 설정 화면의 '이용 통계 수집'
 *    토글이 유일한 스위치고, 처리방침 §12(자동 수집 장치)의 "거부 방법" 필수 기재(시행령
 *    제31조① 제6호)가 그 토글을 가리킨다. **토글 문구·위치를 바꾸면 처리방침도 같이 고칠 것.**
 *    플래그는 기기 단위다(계정 단위가 아니다 — 수집 자체가 익명 기기 단위라서, 계정별로 갈면
 *    로그아웃 상태의 수집을 설명할 수 없다).
 *
 * **키가 없으면 완전 no-op다** — `VITE_AMPLITUDE_API_KEY` 미설정 빌드는 SDK를 초기화조차
 * 하지 않아 네트워크 요청이 0건이고, 기존 동작과 완전히 같다.
 *
 * 키는 2026-08-11 운영(Vercel Production) env에 투입됐고, 같은 배포에 처리방침 개정이
 * 실렸다(CHMO-662 — §12 자동 수집 장치 교체·§8 위탁 표 Amplitude 행·§9 국외 이전 신설).
 * ⚠ 남은 제약: 문서 version 인상 여부(재동의 대상인지)는 변호사 확인 + BE `AgreementType`
 * 동반 인상으로만 가능하다(FE 단독 인상 시 가입 동의 제출이 전부 VALID400 — 정본 §12 마커).
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
  /**
   * 화면 이탈 (CHMO-691) — `screen_view`의 짝. 이게 없으면 **들어온 기록만 있고 나간 기록이
   * 없어서**, 마지막 화면이 08이라는 건 알아도 3초 보고 튕긴 건지 2분 붙잡고 있다 포기한
   * 건지 구분되지 않는다. 체류 시간(`duration_ms`)이 그 구분을 만든다.
   */
  | 'screen_leave'
  /** 소셜 로그인 버튼 탭 — 프로바이더별 이탈을 본다 */
  | 'login_start'
  /**
   * 로그인 성립 (CHMO-691) — `login_start`의 짝. 시작만 세고 성공을 안 세면 분모가 없어
   * "카카오만 실패하고 있다"를 볼 수 없다. provider는 콜백 URL에 없어 세션 위탁으로 잇는다
   * (`lib/auth`의 소셜 provider 보관 — returnTo와 같은 이유·같은 관용).
   */
  | 'login_success'
  /** 가입 동의 화면 도달 (CHMO-691) — 제출(`signup_consent_submit`) 대비 이탈률의 분모 */
  | 'signup_consent_view'
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
  /**
   * 20 초대 공유 — 링크를 내보내는 유일한 길이다(CHMO-683에서 [⧉ 링크복사]가 폐지되며 짝이던
   * `invite_link_copy`도 사라졌다. 값 카드의 코드·비밀번호 복사는 세지 않는다 —
   * 그건 링크가 안 통하는 자리의 우회로라 '초대를 보냈다'와 같은 뜻이 아니다).
   */
  | 'invite_share'
  /** 02-1·02-2 참여(신청) 제출 */
  | 'join_submit'
  /**
   * 합류 결과 (CHMO-691) — `join_submit`의 짝. 제출만 세면 비밀번호를 틀려 되돌아간 사람과
   * 실제로 들어온 사람이 한 수에 섞인다. 즉시 합류(일반)와 승인 대기(비즈니스)도 여기서 갈린다.
   */
  | 'join_result'
  /**
   * 에러 화면 노출 (CHMO-691) — 사용자가 **막혀 멈춰 선** 자리. 화면이 통째로 실패한 경우만
   * 세고(공용 `ErrorState` 한 곳), 인라인 재시도·토스트는 세지 않는다.
   * ⚠ BE 메시지 원문은 절대 싣지 않는다 — 거기 모임명·인물명이 섞일 수 있다.
   */
  | 'error_shown'
  /** 사진 저장 — 이 앱의 최종 가치가 도달하는 지점 */
  | 'photo_save'
  /**
   * 사진 저장 실패 (CHMO-691) — `photo_save`는 **시작 시점**에 발화하므로 그것만으로는
   * 실제로 사진이 갤러리에 도착했는지 알 수 없다. 사용자 취소는 정상 흐름이라 세지 않는다.
   */
  | 'photo_save_fail'

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
/**
 * 현재 화면에 들어온 시각 (CHMO-691). null이면 **체류를 세고 있지 않다**는 뜻이고,
 * 그 상태는 둘 중 하나다 — 아직 첫 화면 전이거나, 백그라운드로 나가며 이미 마감했거나.
 */
let screenEnteredAt: number | null = null
/**
 * 체류 시간 상한 30분. 탭을 열어 둔 채 잊은 세션이 "이 화면에서 6시간 머물렀다"로 잡히면
 * 평균이 통째로 망가진다 — 그런 값은 체류가 아니라 방치라서 캡에서 잘라낸다.
 */
const SCREEN_MAX_MS = 30 * 60 * 1000

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

/**
 * 수집 거부 플래그 (CHMO-662) — 처리방침 §12 "거부 방법"의 실체. 기기 단위 저장이라
 * 계정 접미사를 붙이지 않는다(수집이 익명 기기 단위 — 파일 머리 주석 ⑥).
 * localStorage 접근은 전부 try/catch — 추적 장치가 앱을 죽이는 일은 없어야 한다.
 */
const OPT_OUT_KEY = 'cheesemoa.analytics.optOut'

export function isAnalyticsOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) !== null
  } catch {
    return false
  }
}

/**
 * 설정 '이용 통계 수집' 토글의 저장 지점. 세션 중 전환도 즉시 반영한다 —
 * 끄기: SDK가 이미 떠 있으면 setOptOut(자동 세션 이벤트까지 멈춘다) + 대기 큐 폐기.
 * 켜기: 부트 때 거부 상태여서 초기화를 건너뛴 경우가 있어 init을 다시 시도한다(멱등).
 */
export function setAnalyticsOptOut(optOut: boolean): void {
  try {
    if (optOut) localStorage.setItem(OPT_OUT_KEY, '1')
    else localStorage.removeItem(OPT_OUT_KEY)
  } catch {
    /* 저장 실패(프라이빗 모드 등)여도 아래 SDK 반영은 진행 — 이번 세션만이라도 멈춘다 */
  }
  if (optOut) pending.length = 0
  if (sdk) sdk.setOptOut(optOut)
  else if (!optOut) void initAnalytics()
}

/** 키가 없으면 아무것도 하지 않는다 — 미설정 빌드에서 이 모듈은 순수 함수 몇 개일 뿐이다 */
function enabled(): boolean {
  return Boolean(API_KEY) && !isAnalyticsOptedOut()
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
  // import가 나는 동안 사용자가 수집을 껐을 수 있다 — 자동 세션 이벤트까지 여기서 막는다
  if (isAnalyticsOptedOut()) {
    amplitude.setOptOut(true)
    pending.length = 0
    return
  }
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
 * 막힌 지점 기록 (CHMO-691) — 화면이 통째로 실패해 사용자가 멈춰 선 자리.
 *
 * **에러 객체를 통째로 받아 여기서 code·status만 뽑는다.** 호출부가 프로퍼티를 조립하게 두면
 * 언젠가 `toErrorMessage(err)`가 딸려 들어오는데, BE 메시지에는 모임명·인물명이 섞일 수 있다
 * (파일 머리 주석 ①의 연장). 이 함수를 지나는 한 **메시지는 구조적으로 나갈 수 없다** —
 * 나머지 안전장치가 전부 이 파일에 있는 것과 같은 이유로 이 규칙도 여기 둔다.
 */
export function trackErrorShown(pathname: string, error: { status: number; code: string }): void {
  trackEvent('error_shown', { screen: screenOf(pathname), code: error.code, status: error.status })
}

/**
 * 직전 화면의 체류를 마감한다 (CHMO-691). `screenEnteredAt`을 null로 되돌려 **두 번 마감되지
 * 않게** 한다 — 백그라운드 전환과 화면 이동이 잇따라 오면 같은 체류가 두 번 실릴 수 있다.
 */
function emitScreenLeave(): void {
  if (lastScreen === null || screenEnteredAt === null) return
  const elapsed = Date.now() - screenEnteredAt
  screenEnteredAt = null
  // 음수는 기기 시계가 뒤로 간 경우 — 0으로 접는다(버리면 이탈 자체가 사라진다)
  trackEvent('screen_leave', { screen: lastScreen, duration_ms: Math.min(Math.max(0, elapsed), SCREEN_MAX_MS) })
}

/**
 * 화면 진입 기록. **경로가 아니라 화면 코드를 싣는다**(파일 머리 주석 ①).
 * 같은 화면이 연달아 들어오면 무시한다 — 한 번의 이동에 subscribe가 여러 번 불린다.
 * 새 화면을 열기 전에 직전 화면을 마감해 `screen_view`↔`screen_leave`가 짝을 이룬다.
 */
export function trackScreen(pathname: string): void {
  if (!enabled()) return
  const screen = screenOf(pathname)
  if (screen === lastScreen) return
  emitScreenLeave()
  lastScreen = screen
  screenEnteredAt = Date.now()
  trackEvent('screen_view', { screen })
}

/**
 * 앱을 떠날 때(탭 닫기·백그라운드 전환) 체류를 마감한다 (CHMO-691).
 *
 * **`unload`가 아니라 `pagehide`로 부른다** — iOS Safari는 `unload`를 자주 건너뛰어서
 * 거기 걸면 모바일에서 마지막 화면이 통째로 유실된다(이 서비스는 모바일웹이 본류다).
 *
 * 마감 뒤 전송을 beacon으로 바꿔 밀어낸다. 평소 전송은 배치라 페이지가 죽으면 큐가 함께
 * 사라지는데, beacon은 브라우저가 페이지와 무관하게 끝까지 보내 준다 — 이걸 안 하면
 * 정작 가장 중요한 **마지막 화면의 이탈**만 골라서 잃는다.
 */
export function endScreenSession(): void {
  if (!enabled()) return
  emitScreenLeave()
  try {
    sdk?.setTransport('beacon')
    void sdk?.flush()
  } catch {
    /* 전송 방식 전환 실패는 지표 손실일 뿐 — 페이지를 떠나는 길을 막지 않는다 */
  }
}

/**
 * 백그라운드에서 돌아왔을 때 체류를 다시 센다 (CHMO-691).
 * 이게 없으면 앱을 접어 둔 시간이 그대로 체류로 잡혀 **화면에 오래 머문 것처럼 보인다**
 * (앱 웹뷰는 홈으로 나가는 것만으로도 여기를 지난다).
 */
export function resumeScreenSession(): void {
  if (!enabled()) return
  if (lastScreen !== null && screenEnteredAt === null) screenEnteredAt = Date.now()
}

/** 테스트 전용 — 모듈 전역(중복 방지 상태)을 초기화한다 */
export function __resetAnalyticsForTest(): void {
  initialized = false
  lastScreen = null
  screenEnteredAt = null
  sdk = null
  pending.length = 0
}
