import { describe, expect, it } from 'vitest'
import {
  EMPTY_TAP_STREAK,
  REVIEW_LOGIN_TAP_COUNT,
  REVIEW_LOGIN_TAP_GAP_MS,
  advanceTapStreak,
  reachesReviewLogin,
} from './reviewLogin'

/** 심사 노트(CHMO-543)에 "5회 탭"으로 공개하는 절차 — 판정이 어긋나면 심사관이 못 들어온다 */
describe('advanceTapStreak', () => {
  it('시간창 안에서 이어진 탭은 누적된다', () => {
    let streak = EMPTY_TAP_STREAK
    for (let i = 0; i < REVIEW_LOGIN_TAP_COUNT; i++) {
      streak = advanceTapStreak(streak, 1000 + i * 300)
    }
    expect(streak.count).toBe(REVIEW_LOGIN_TAP_COUNT)
    expect(reachesReviewLogin(streak)).toBe(true)
  })

  it('시간창 경계값은 이어진 탭으로 센다', () => {
    const streak = advanceTapStreak({ count: 2, lastAt: 1000 }, 1000 + REVIEW_LOGIN_TAP_GAP_MS)
    expect(streak.count).toBe(3)
  })

  it('시간창을 벗어나면 1부터 다시 센다', () => {
    const streak = advanceTapStreak(
      { count: 4, lastAt: 1000 },
      1000 + REVIEW_LOGIN_TAP_GAP_MS + 1,
    )
    expect(streak.count).toBe(1)
    expect(reachesReviewLogin(streak)).toBe(false)
  })

  it('빈 스트릭의 첫 탭은 직전 시각과 무관하게 1이다', () => {
    // lastAt 0 근처의 now(가짜 타이머 등)에서도 count 0이면 이어진 탭으로 치지 않는다
    expect(advanceTapStreak(EMPTY_TAP_STREAK, 100).count).toBe(1)
  })

  it('5회 미만은 노출 조건에 못 미친다', () => {
    let streak = EMPTY_TAP_STREAK
    for (let i = 0; i < REVIEW_LOGIN_TAP_COUNT - 1; i++) {
      streak = advanceTapStreak(streak, 1000 + i * 300)
    }
    expect(reachesReviewLogin(streak)).toBe(false)
  })
})
