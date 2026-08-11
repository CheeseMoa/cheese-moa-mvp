/**
 * 앱으로 건너가는 링크 생성 (CHMO-661) — 커스텀 스킴 · App Store · 카카오톡 외부 열기.
 *
 * 스킴 형태의 계약 원천은 앱 리포 `lib/src/deep_links.dart`(CHMO-538)다: URI 문법상 첫 조각이
 * host로 파싱되므로 `cheesemoa://join/{joinKey}`는 셸에서 `/join/{joinKey}`로 되돌려진다.
 * 여기서 만드는 값이 그 규칙을 따르지 않으면 앱은 열리되 엉뚱한 화면에 착지한다.
 */

/** iOS 앱 App Store ID (2026-08-10 출시 — CHMO-657) */
export const APP_STORE_APP_ID = '6797158719'

/**
 * App Store 상품 페이지. `itms-apps://`가 아니라 https인 이유는 웹뷰·브라우저 어디서 눌려도
 * 실패하지 않기 때문 — iOS는 이 주소를 App Store 앱으로 넘기고, 아니면 웹 페이지로 열린다.
 */
export const APP_STORE_URL = `https://apps.apple.com/kr/app/id${APP_STORE_APP_ID}`

/**
 * 웹 경로(`/join/KEY?type=…`)를 앱 커스텀 스킴 URL로. 경로가 비면(`/`) 스킴만 남아 셸이 홈으로
 * 여는 꼴이라 그대로 두지 않고 null — 호출부가 스킴 시도를 건너뛴다.
 */
export function appSchemeUrl(pathWithQuery: string): string | null {
  const trimmed = pathWithQuery.replace(/^\/+/, '')
  if (!trimmed || trimmed.startsWith('?')) return null
  return `cheesemoa://${trimmed}`
}

/**
 * 카카오톡 인앱 브라우저에서 기기 기본 브라우저로 같은 주소를 여는 링크.
 * 카카오톡이 소비하는 전용 스킴이라 다른 환경에서는 아무 일도 일어나지 않는다 —
 * 호출부가 인앱 브라우저 판정(lib/inAppBrowser) 뒤에서만 쓴다.
 */
export function kakaoOpenExternalUrl(absoluteUrl: string): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(absoluteUrl)}`
}
