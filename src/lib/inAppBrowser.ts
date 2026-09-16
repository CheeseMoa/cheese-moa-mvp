/**
 * 인앱 브라우저·기기 판정 단일 원천 (CHMO-661 · CHMO-820).
 *
 * 카카오톡으로 유통되는 초대 링크를 탭하면 **카카오톡 인앱 브라우저**가 열리는데, 이 웹뷰는
 * 유니버설 링크(iOS)·App Links(Android)를 가로채지 않아 CHMO-538에서 등록한 딥링크가 아예
 * 발동하지 않는다 — 앱이 깔려 있어도 카톡 안에서 웹이 열린다. 초대 링크 착지(AppOpenGuide)는
 * 이 판정으로 앱 열기 수단을 가른다(카톡 안에서는 스킴·외부 브라우저 이탈, 일반 브라우저는
 * 스킴·intent).
 *
 * **우리 앱 웹뷰는 인앱 브라우저가 아니다** — 앱 안에서 유도가 뜨면 자기 자신을 열라는 화면이
 * 된다. 앱 감지는 UA 마커 하나가 단일 원천이므로(native/bridge) 그것을 그대로 쓴다(네이티브
 * 앱은 컷오버(CHMO-736)로 웹뷰를 걷었지만 구버전 셸 설치본 방어로 판정은 남긴다).
 *
 * 넘기기 기록(sessionStorage `cheesemoa.inAppGuideDismissed`)은 CHMO-820에서 삭제 — 웹으로
 * 계속 쓰는 길([이대로 계속 보기])이 없어져 기록할 것이 없다.
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
 * 기기 플랫폼 — 앱 열기 수단(iOS 스킴 / Android intent / 그 외 스토어 안내)이 갈리는 근거.
 * iPadOS 13+는 Mac UA로 위장하므로 터치 지점 수로 가른다(실 Mac은 0 — photoSave의 iOS 판별과
 * 같은 관용). 판정이 애매하면 'other'로 두고 호출부가 앱을 열 수 없는 기기로 다룬다.
 */
export function detectDevicePlatform(): DevicePlatform {
  const ua = userAgent()
  if (/iP(hone|ad|od)/.test(ua) || (ua.includes('Mac') && maxTouchPoints() > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}
