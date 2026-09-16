/**
 * 앱으로 건너가는 링크 생성 (CHMO-661 · CHMO-820) — 커스텀 스킴 · Android intent · 스토어 · 카카오톡 외부 열기.
 *
 * 스킴 형태의 계약 원천은 앱 리포 `lib/app/deep_links.dart`(CHMO-538)다: URI 문법상 첫 조각이
 * host로 파싱되므로 `cheesemoa://join/{joinKey}`는 앱에서 `/join/{joinKey}`로 되돌려진다.
 * 여기서 만드는 값이 그 규칙을 따르지 않으면 앱은 열리되 엉뚱한 화면에 착지한다.
 */

/** iOS 앱 App Store ID (2026-08-10 출시 — CHMO-657) */
export const APP_STORE_APP_ID = '6797158719'

/**
 * App Store 상품 페이지. `itms-apps://`가 아니라 https인 이유는 웹뷰·브라우저 어디서 눌려도
 * 실패하지 않기 때문 — iOS는 이 주소를 App Store 앱으로 넘기고, 아니면 웹 페이지로 열린다.
 */
export const APP_STORE_URL = `https://apps.apple.com/kr/app/id${APP_STORE_APP_ID}`

/** Android 패키지명 — 앱 리포 applicationId(CHMO-536). dev 번들(`.dev`)은 스토어에 없다. */
export const ANDROID_PACKAGE = 'com.cheesemoa.app'

/** Google Play 상품 페이지 (2026-09 출시 확인 — CHMO-820). App Store와 같은 이유로 https. */
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`

/** 앱이 App Links(`assetlinks.json`)·유니버설 링크(AASA)로 등록한 도메인 — 이 웹의 오리진. */
export const DEEP_LINK_HOST = 'app.cheese-moa.com'

/** `/join/KEY?…` → `join/KEY?…`. 경로가 비면(`/`) null — 호출부가 앱 열기 시도를 건너뛴다. */
function stripLeadingSlash(pathWithQuery: string): string | null {
  const trimmed = pathWithQuery.replace(/^\/+/, '')
  if (!trimmed || trimmed.startsWith('?')) return null
  return trimmed
}

/**
 * 웹 경로(`/join/KEY?type=…`)를 앱 커스텀 스킴 URL로. 경로가 비면(`/`) 스킴만 남아 앱이 홈으로
 * 열리는 꼴이라 그대로 두지 않고 null — 호출부가 스킴 시도를 건너뛴다.
 */
export function appSchemeUrl(pathWithQuery: string): string | null {
  const trimmed = stripLeadingSlash(pathWithQuery)
  return trimmed === null ? null : `cheesemoa://${trimmed}`
}

/**
 * Android intent URL — 크롬·삼성 인터넷이 해석하는 앱 실행 링크 (CHMO-820).
 * 데이터는 `https://app.cheese-moa.com/join/…` 그대로라 앱의 App Links intent-filter에 맞고,
 * `package`를 직지정하므로 **`assetlinks.json` 검증 여부와 무관하게** 설치본이 열린다(검증이
 * 깨져 있던 기간에도 이 링크는 앱을 연다). 미설치면 브라우저가 스스로 `S.browser_fallback_url`
 * (Play)로 간다 — 별도 타이머 없이도 스토어 폴백이 성립하지만, intent를 모르는 브라우저를
 * 위해 호출부는 시간 폴백을 겹쳐 둔다.
 */
export function androidIntentUrl(pathWithQuery: string): string | null {
  const trimmed = stripLeadingSlash(pathWithQuery)
  if (trimmed === null) return null
  const fallback = encodeURIComponent(PLAY_STORE_URL)
  return `intent://${DEEP_LINK_HOST}/${trimmed}#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`
}

/**
 * 카카오톡 인앱 브라우저에서 기기 기본 브라우저로 같은 주소를 여는 링크.
 * 카카오톡이 소비하는 전용 스킴이라 다른 환경에서는 아무 일도 일어나지 않는다 —
 * 호출부가 인앱 브라우저 판정(lib/inAppBrowser) 뒤에서만 쓴다.
 */
export function kakaoOpenExternalUrl(absoluteUrl: string): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(absoluteUrl)}`
}
