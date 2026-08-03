/**
 * CHMO-551 — UA별 소셜 로그인 버튼 노출 분기.
 * Apple만 Android 앱 웹뷰에서 숨고, 그 외(iOS 앱 웹뷰·일반 브라우저·형식 미상 마커)는
 * 전부 노출 유지임을 고정한다. navigator는 vi.stubGlobal로 심는다(unstubGlobals 자동 원복).
 */
import { describe, expect, it, vi } from 'vitest'
import { isSocialProviderVisible } from './socialProviders'

const stubUa = (ua: string) => vi.stubGlobal('navigator', { userAgent: ua })

const ANDROID_BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const ANDROID_APP_UA = `${ANDROID_BROWSER_UA} CheeseMoaApp/1.0.0 (android) Bridge/1`
const IOS_APP_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CheeseMoaApp/1.0.0 (ios) Bridge/1'

describe('isSocialProviderVisible', () => {
  it('Android 앱 웹뷰에서는 apple만 숨긴다', () => {
    stubUa(ANDROID_APP_UA)
    expect(isSocialProviderVisible('apple')).toBe(false)
    expect(isSocialProviderVisible('kakao')).toBe(true)
    expect(isSocialProviderVisible('google')).toBe(true)
    expect(isSocialProviderVisible('naver')).toBe(true)
  })

  it('iOS 앱 웹뷰에서는 apple을 노출한다 (심사 요건 4.8 — 숨기면 안 된다)', () => {
    stubUa(IOS_APP_UA)
    expect(isSocialProviderVisible('apple')).toBe(true)
  })

  it('일반 브라우저(마커 없음)에서는 Android 기기여도 apple을 노출한다', () => {
    stubUa(ANDROID_BROWSER_UA)
    expect(isSocialProviderVisible('apple')).toBe(true)
  })

  it('마커가 있어도 형식이 달라 platform을 모르면 노출을 유지한다', () => {
    stubUa(`${ANDROID_BROWSER_UA} CheeseMoaApp/dev`)
    expect(isSocialProviderVisible('apple')).toBe(true)
  })
})
