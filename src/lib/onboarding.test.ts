import { describe, expect, it } from 'vitest'
import { setCurrentUserId } from './auth'
import {
  getPreferredTourTrack,
  hasSeenOnboarding,
  markOnboardingSeen,
  postLoginDestination,
  setPreferredTourTrack,
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

/**
 * 초대 링크로 합류한 사람은 어느 쪽인지 이미 행동으로 밝혔다 — 둘러보기가 첫 장에서 역할을
 * 다시 묻지 않게 갈래를 남긴다. 자동 노출이 참여 흐름 **다음** 방문으로 밀리므로 navigate
 * state로는 전달되지 않아 로컬에 남기고, 따라서 완료 플래그와 같은 계정별 격리가 필요하다.
 */
describe('둘러보기 갈래 힌트 (CHMO-504)', () => {
  it('남긴 적 없으면 null — 투어 첫 장에서 직접 고른다', () => {
    setCurrentUserId(4)
    expect(getPreferredTourTrack()).toBeNull()
  })

  it('학부모·선생님 갈래를 그대로 되읽는다', () => {
    setCurrentUserId(4)
    setPreferredTourTrack('parent')
    expect(getPreferredTourTrack()).toBe('parent')
    setPreferredTourTrack('teacher')
    expect(getPreferredTourTrack()).toBe('teacher')
  })

  it('계정별로 갈린다 — role은 계정 속성이 아니라 이 사람이 들어온 문의 기록이다', () => {
    setCurrentUserId(4)
    setPreferredTourTrack('parent')
    setCurrentUserId(7)
    expect(getPreferredTourTrack()).toBeNull()
  })

  it('완료 플래그와 서로를 오염시키지 않는다', () => {
    setCurrentUserId(4)
    setPreferredTourTrack('parent')
    // 갈래만 남았을 뿐 아직 본 적은 없다 — 다음 홈 방문에 학부모 흐름으로 떠야 한다
    expect(hasSeenOnboarding()).toBe(false)
    markOnboardingSeen()
    expect(getPreferredTourTrack()).toBe('parent')
  })
})
