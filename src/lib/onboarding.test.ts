import { describe, expect, it } from 'vitest'
import { setCurrentUserId } from './auth'
import { hasSeenOnboarding, markOnboardingSeen, postLoginDestination } from './onboarding'

/**
 * 온보딩 노출은 서버가 판정해 주지 않는다(BE에 신규 가입 신호가 없다) — 이 로컬 규칙이 곧 계약이라
 * 화면 대신 여기서 고정한다. setup.ts가 테스트마다 localStorage와 토큰을 비운다.
 */
describe('첫 사용 온보딩 노출 판정 (CHMO-481)', () => {
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

  it('로그인 후 목적지는 처음이면 온보딩, 이미 봤으면 홈', () => {
    setCurrentUserId(4)
    expect(postLoginDestination()).toBe('/onboarding')
    markOnboardingSeen()
    expect(postLoginDestination()).toBe('/home')
  })

  it('returnTo가 있으면 온보딩이 그 흐름을 끊지 않는다', () => {
    setCurrentUserId(4)
    expect(postLoginDestination('/join/HAETSAL')).toBe('/join/HAETSAL')
  })
})
