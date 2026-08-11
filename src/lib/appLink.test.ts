/**
 * CHMO-661 — 앱으로 건너가는 링크 생성.
 * 커스텀 스킴은 앱 리포 `deep_links.dart`(CHMO-538)와 짝이라 형태가 어긋나면 앱이 열리고도
 * 엉뚱한 화면에 착지한다 — 첫 조각이 host로 파싱되는 규칙(`cheesemoa://join/KEY` → `/join/KEY`)을
 * 여기서 고정한다.
 */
import { describe, expect, it } from 'vitest'
import { APP_STORE_URL, appSchemeUrl, kakaoOpenExternalUrl } from './appLink'

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
