import { describe, expect, it } from 'vitest'
import { setCurrentUserId } from './auth'
import {
  hasSeenCoachHint,
  hasSeenOnboarding,
  markCoachHintSeen,
  markOnboardingSeen,
  postLoginDestination,
} from './onboarding'

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

  // 로그인 직후 별도 화면으로 튕기지 않는다 — 자동 안내 자체가 없으므로(CHMO-565) 목적지는
  // 언제나 홈이고, 이 플래그는 슬라이드(00) 부활 대비 기록으로만 남는다
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

/**
 * 코치 힌트(CHMO-565) — 자동 투어를 대신해 실제 화면의 낯선 지점에 계정당 1회 뜨는 안내.
 * 노출 판정은 서버가 해 주지 않으므로 이 로컬 규칙이 곧 계약이다: 힌트 id 단위·계정별 격리.
 */
describe('코치 힌트 노출 기록 (CHMO-565)', () => {
  it('기록 전에는 본 적 없음으로 판정한다', () => {
    setCurrentUserId(4)
    expect(hasSeenCoachHint('album-grid')).toBe(false)
  })

  it('기록하면 같은 계정·같은 힌트만 다시 뜨지 않는다 — id 단위 격리', () => {
    setCurrentUserId(4)
    markCoachHintSeen('album-grid')
    expect(hasSeenCoachHint('album-grid')).toBe(true)
    // 다른 힌트를 새로 달아도 이미 본 힌트의 기록이 그걸 가리면 안 된다
    expect(hasSeenCoachHint('another-hint')).toBe(false)
  })

  it('계정별로 갈린다 — 기기 공유 시 다른 계정의 첫 안내를 잃지 않는다', () => {
    setCurrentUserId(4)
    markCoachHintSeen('album-grid')
    setCurrentUserId(7)
    expect(hasSeenCoachHint('album-grid')).toBe(false)
  })

  it('온보딩 완료 플래그와 서로를 오염시키지 않는다', () => {
    setCurrentUserId(4)
    markCoachHintSeen('album-grid')
    expect(hasSeenOnboarding()).toBe(false)
    markOnboardingSeen()
    expect(hasSeenCoachHint('album-grid')).toBe(true)
  })
})
