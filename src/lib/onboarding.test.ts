import { describe, expect, it } from 'vitest'
import { setCurrentUserId } from './auth'
import { hasSeenOnboarding, markOnboardingSeen, postLoginDestination } from './onboarding'

/**
 * 온보딩 노출은 서버가 판정해 주지 않는다(BE에 신규 가입 신호가 없다) — 이 로컬 규칙이 곧 계약이라
 * 화면 대신 여기서 고정한다. setup.ts가 테스트마다 localStorage와 토큰을 비운다.
 */
describe('첫 사용 안내 노출 판정 (CHMO-481 · CHMO-504)', () => {
  it('기록 전에는 본 적 없음으로 판정한다', () => {
    setCurrentUserId(4)
    expect(hasSeenOnboarding()).toBe(false)
  })

  it('완료를 기록하면 같은 계정에선 다시 뜨지 않는다', () => {
    setCurrentUserId(4)
    markOnboardingSeen()
    expect(hasSeenOnboarding()).toBe(true)
  })

  it('다른 계정으로 로그인하면 다시 뜬다 — 플래그 키가 계정별이다', () => {
    setCurrentUserId(4)
    markOnboardingSeen()
    setCurrentUserId(7)
    expect(hasSeenOnboarding()).toBe(false)
  })

  // CHMO-504: 첫 안내가 슬라이드 화면에서 홈 위 둘러보기로 바뀌면서 목적지는 언제나 홈이다 —
  // 로그인 직후 별도 화면으로 튕기지 않고, 안 봤는지 여부는 홈이 hasSeenOnboarding으로 판정한다
  it('로그인 후 목적지는 처음이든 아니든 홈이다', () => {
    setCurrentUserId(4)
    expect(postLoginDestination()).toBe('/home')
    markOnboardingSeen()
    expect(postLoginDestination()).toBe('/home')
  })

  it('returnTo가 있으면 첫 안내가 그 흐름을 끊지 않는다', () => {
    setCurrentUserId(4)
    expect(postLoginDestination('/join/HAETSAL')).toBe('/join/HAETSAL')
  })
})
