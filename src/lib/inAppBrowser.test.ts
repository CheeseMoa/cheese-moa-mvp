/**
 * CHMO-661 — 인앱 브라우저·플랫폼 판정.
 * 고정하는 것은 셋이다: 카카오톡 웹뷰를 잡는가 · **우리 앱 웹뷰는 잡지 않는가**(앱 안에서
 * 안내가 뜨면 자기 자신을 열라는 화면이 된다) · 유도 갈래를 정하는 플랫폼 판별.
 * navigator는 vi.stubGlobal로 심는다(unstubGlobals 자동 원복).
 */
import { describe, expect, it, vi } from 'vitest'
import { detectDevicePlatform, detectInAppBrowser } from './inAppBrowser'

const stubUa = (userAgent: string, maxTouchPoints = 0) =>
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints })

const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
// 카카오톡은 UA 끝에 마커를 붙인다 — iOS는 공백, Android는 세미콜론 뒤
const IOS_KAKAO_UA = `${IOS_SAFARI_UA.replace(' Safari/604.1', '')} KAKAOTALK 10.5.5`
const ANDROID_KAKAO_UA = `${ANDROID_CHROME_UA};KAKAOTALK 25.1.5`
const IOS_APP_UA = `${IOS_SAFARI_UA} CheeseMoaApp/1.0.0 (ios) Bridge/1`

describe('detectInAppBrowser', () => {
  it('카카오톡 인앱 브라우저를 iOS·Android 양쪽에서 잡는다', () => {
    stubUa(IOS_KAKAO_UA)
    expect(detectInAppBrowser()).toBe('kakaotalk')
    stubUa(ANDROID_KAKAO_UA)
    expect(detectInAppBrowser()).toBe('kakaotalk')
  })

  it('일반 브라우저는 인앱이 아니다', () => {
    stubUa(IOS_SAFARI_UA)
    expect(detectInAppBrowser()).toBeNull()
    stubUa(ANDROID_CHROME_UA)
    expect(detectInAppBrowser()).toBeNull()
  })

  it('우리 앱 웹뷰는 인앱 브라우저로 보지 않는다', () => {
    stubUa(IOS_APP_UA)
    expect(detectInAppBrowser()).toBeNull()
  })

  it('앱 웹뷰 마커가 카카오톡 마커와 함께 와도 앱이 이긴다', () => {
    // 이론적 조합이지만 우선순위를 고정한다 — 앱 안에서는 어떤 경우에도 안내가 뜨면 안 된다
    stubUa(`${IOS_KAKAO_UA} CheeseMoaApp/1.0.0 (ios) Bridge/1`)
    expect(detectInAppBrowser()).toBeNull()
  })
})

describe('detectDevicePlatform', () => {
  it('iPhone·Android를 가른다', () => {
    stubUa(IOS_KAKAO_UA)
    expect(detectDevicePlatform()).toBe('ios')
    stubUa(ANDROID_KAKAO_UA)
    expect(detectDevicePlatform()).toBe('android')
  })

  it('Mac UA로 위장한 iPadOS는 터치 지점 수로 iOS로 본다', () => {
    const IPADOS_UA =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
    stubUa(IPADOS_UA, 5)
    expect(detectDevicePlatform()).toBe('ios')
    // 실제 맥은 터치 지점이 0이라 iOS가 아니다
    stubUa(IPADOS_UA, 0)
    expect(detectDevicePlatform()).toBe('other')
  })
})
