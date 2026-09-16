/**
 * CHMO-661 · CHMO-820 — 앱으로 건너가는 링크 생성.
 * 커스텀 스킴은 앱 리포 `deep_links.dart`(CHMO-538)와 짝이라 형태가 어긋나면 앱이 열리고도
 * 엉뚱한 화면에 착지한다 — 첫 조각이 host로 파싱되는 규칙(`cheesemoa://join/KEY` → `/join/KEY`)을
 * 여기서 고정한다. Android intent는 앱 매니페스트의 App Links intent-filter(https ·
 * app.cheese-moa.com · /join/ 접두)와 패키지명에 맞아야 설치본이 열린다.
 */
import { describe, expect, it } from 'vitest'
import {
  ANDROID_PACKAGE,
  APP_STORE_URL,
  PLAY_STORE_URL,
  androidIntentUrl,
  appSchemeUrl,
  kakaoOpenExternalUrl,
} from './appLink'

describe('appSchemeUrl', () => {
  it('초대 경로를 스킴 URL로 바꾼다 (쿼리 마커 보존)', () => {
    expect(appSchemeUrl('/join/AbC123?type=business&role=viewer')).toBe(
      'cheesemoa://join/AbC123?type=business&role=viewer',
    )
  })

  it('쿼리가 없어도 동작한다', () => {
    expect(appSchemeUrl('/join/AbC123')).toBe('cheesemoa://join/AbC123')
  })

  it('경로가 비면 null — 스킴만 남은 링크는 앱을 홈으로 열 뿐이라 시도하지 않는다', () => {
    expect(appSchemeUrl('/')).toBeNull()
    expect(appSchemeUrl('')).toBeNull()
    expect(appSchemeUrl('/?type=general')).toBeNull()
  })
})

describe('androidIntentUrl', () => {
  it('앱 링크 데이터(https + 등록 도메인 + /join/…)와 패키지, Play 폴백을 싣는다', () => {
    const url = androidIntentUrl('/join/AbC123?type=business&role=viewer')
    expect(url).toBe(
      'intent://app.cheese-moa.com/join/AbC123?type=business&role=viewer' +
        '#Intent;scheme=https;package=com.cheesemoa.app;' +
        `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`,
    )
  })

  it('패키지는 스토어 패키지(dev 번들 아님) — 폴백 URL이 그 패키지의 Play 페이지다', () => {
    expect(ANDROID_PACKAGE).toBe('com.cheesemoa.app')
    expect(PLAY_STORE_URL).toBe('https://play.google.com/store/apps/details?id=com.cheesemoa.app')
  })

  it('경로가 비면 null — 스킴과 같은 규칙', () => {
    expect(androidIntentUrl('/')).toBeNull()
    expect(androidIntentUrl('/?type=general')).toBeNull()
  })

  it('폴백 URL의 쿼리(?id=)가 intent 문법을 깨지 않게 인코딩된다', () => {
    const url = androidIntentUrl('/join/AbC123') ?? ''
    // `;`로 구분되는 Intent 필드 안에 `?`·`=`·`/`가 날것으로 들어가면 파서가 갈라 읽는다
    const fallback = url.split('S.browser_fallback_url=')[1]?.split(';')[0] ?? ''
    expect(fallback).not.toContain('/')
    expect(fallback).not.toContain('?')
    expect(decodeURIComponent(fallback)).toBe(PLAY_STORE_URL)
  })
})

describe('kakaoOpenExternalUrl', () => {
  it('주소를 인코딩해 카카오톡 외부 열기 스킴에 싣는다', () => {
    expect(kakaoOpenExternalUrl('https://app.cheese-moa.com/join/AbC?type=general')).toBe(
      'kakaotalk://web/openExternal?url=https%3A%2F%2Fapp.cheese-moa.com%2Fjoin%2FAbC%3Ftype%3Dgeneral',
    )
  })
})

describe('APP_STORE_URL', () => {
  it('출시된 iOS 앱 ID를 가리킨다 (CHMO-657)', () => {
    expect(APP_STORE_URL).toBe('https://apps.apple.com/kr/app/id6797158719')
  })
})
