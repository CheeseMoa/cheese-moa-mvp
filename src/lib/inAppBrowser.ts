/**
 * 인앱 브라우저·기기 판정 단일 원천 (CHMO-661).
 *
 * 카카오톡으로 유통되는 초대 링크를 탭하면 **카카오톡 인앱 브라우저**가 열리는데, 이 웹뷰는
 * 유니버설 링크(iOS)·App Links(Android)를 가로채지 않아 CHMO-538에서 등록한 딥링크가 아예
 * 발동하지 않는다 — 앱이 깔려 있어도 카톡 안에서 웹앱이 열린다. 게다가 구글 OAuth는 인앱
 * 웹뷰를 거부하므로(`disallowed_useragent`) 합류의 첫 관문인 로그인부터 막힌다.
 * 그래서 초대 링크 착지 화면이 이 판정으로 앱·외부 브라우저 유도를 띄운다.
 *
 * **우리 앱 웹뷰는 인앱 브라우저가 아니다** — 앱 안에서 유도가 뜨면 자기 자신을 열라는 화면이
 * 된다. 앱 감지는 UA 마커 하나가 단일 원천이므로(native/bridge) 그것을 그대로 쓴다.
 */
import { isNativeApp } from '../native/bridge'

/** 지금 다루는 인앱 브라우저는 카카오톡뿐 — 라인·인스타 등은 유입 경로가 생기면 넓힌다 */
export type InAppBrowser = 'kakaotalk'

export type DevicePlatform = 'ios' | 'android' | 'other'

function userAgent(): string {
  const nav = (globalThis as { navigator?: { userAgent?: unknown } }).navigator
  return typeof nav?.userAgent === 'string' ? nav.userAgent : ''
}

function maxTouchPoints(): number {
  const nav = (globalThis as { navigator?: { maxTouchPoints?: unknown } }).navigator
  return typeof nav?.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0
}

/**
 * 카카오톡 인앱 브라우저 판정. UA 끝에 `KAKAOTALK <버전>`이 붙는다(iOS는 공백, Android는
 * `;KAKAOTALK`) — 버전 형식이 플랫폼·업데이트마다 달라 마커 단어만 본다(대소문자 무시).
 */
export function detectInAppBrowser(): InAppBrowser | null {
  if (isNativeApp()) return null
  return /kakaotalk/i.test(userAgent()) ? 'kakaotalk' : null
}

/**
 * 기기 플랫폼 — 유도 대상(앱 vs 외부 브라우저)이 갈리는 근거.
 * iPadOS 13+는 Mac UA로 위장하므로 터치 지점 수로 가른다(실 Mac은 0 — photoSave의 iOS 판별과
 * 같은 관용). 판정이 애매하면 'other'로 두고 호출부가 가장 보수적인 길(외부 브라우저)을 고른다.
 */
export function detectDevicePlatform(): DevicePlatform {
  const ua = userAgent()
  if (/iP(hone|ad|od)/.test(ua) || (ua.includes('Mac') && maxTouchPoints() > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

// ── 안내 넘기기 기록 ────────────────────────────────────────────
// [이대로 계속 보기]는 **그 방문 동안만** 유효하다(sessionStorage) — 앱을 안 깐 사람이 웹으로
// 쓰는 길을 막지 않으면서, 다음에 다시 초대 링크를 타면 앱 안내를 한 번 더 만난다.
// 계정별로 가르지 않는 이유는 이 판정이 로그인 전에 서기 때문(계정을 모르는 시점이다).

const DISMISS_KEY = 'cheesemoa.inAppGuideDismissed'

export function hasDismissedInAppGuide(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) !== null
  } catch {
    // 저장소를 못 쓰면 넘긴 기록도 못 남긴다 — 매번 가로막느니 안내를 접는다(차단 화면이 아니다)
    return true
  }
}

export function markInAppGuideDismissed(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* 저장 실패 — 이 방문에서 화면 상태로만 유지되고 새로고침하면 한 번 더 보인다 */
  }
}
