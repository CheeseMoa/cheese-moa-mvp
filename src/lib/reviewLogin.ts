/**
 * 스토어 심사용 숨김 로그인 진입 판정 단일 원천(CHMO-572) — 01 랜딩 로고 연속 탭.
 * 심사 노트(CHMO-543)에 공개하는 절차라 수치를 바꾸면 노트 문구도 함께 바꾼다:
 * "On the login screen, tap the cheese logo 5 times, then sign in with ID/PIN."
 */
export const REVIEW_LOGIN_TAP_COUNT = 5

/** 연속 판정 시간창 — 직전 탭에서 이 간격(ms) 안에 이어져야 같은 스트릭으로 센다 */
export const REVIEW_LOGIN_TAP_GAP_MS = 1500

export interface TapStreak {
  count: number
  /** 마지막 탭 시각(ms epoch) — count 0이면 무의미 */
  lastAt: number
}

export const EMPTY_TAP_STREAK: TapStreak = { count: 0, lastAt: 0 }

/** 탭 한 번을 반영한 다음 스트릭 — 시간창을 벗어났으면 1부터 다시 센다 */
export function advanceTapStreak(prev: TapStreak, now: number): TapStreak {
  const continues = prev.count > 0 && now - prev.lastAt <= REVIEW_LOGIN_TAP_GAP_MS
  return { count: continues ? prev.count + 1 : 1, lastAt: now }
}

/** 이 스트릭이 숨김 로그인 폼 노출 조건에 도달했는가 */
export function reachesReviewLogin(streak: TapStreak): boolean {
  return streak.count >= REVIEW_LOGIN_TAP_COUNT
}
