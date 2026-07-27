import { describe, expect, it } from 'vitest'
import { formatTimeAgo } from './timeAgo'

const NOW = new Date('2026-07-27T12:00:00+09:00')

describe('formatTimeAgo (CHMO-447)', () => {
  it('1분 미만은 방금 전', () => {
    expect(formatTimeAgo('2026-07-27T11:59:30+09:00', NOW)).toBe('방금 전')
  })

  it('시계 오차로 미래 시각이 와도 방금 전으로 수렴', () => {
    expect(formatTimeAgo('2026-07-27T12:03:00+09:00', NOW)).toBe('방금 전')
  })

  it('분·시간·일 단위 내림 표기', () => {
    expect(formatTimeAgo('2026-07-27T11:15:00+09:00', NOW)).toBe('45분 전')
    expect(formatTimeAgo('2026-07-27T09:30:00+09:00', NOW)).toBe('2시간 전')
    expect(formatTimeAgo('2026-07-24T12:00:00+09:00', NOW)).toBe('3일 전')
  })

  it('7일 이상은 날짜로 내려간다', () => {
    expect(formatTimeAgo('2026-07-19T09:00:00+09:00', NOW)).toBe('7월 19일')
  })

  it('시각을 못 읽으면 빈 문자열 — 화면이 메타 없이 그린다', () => {
    expect(formatTimeAgo('not-a-date', NOW)).toBe('')
  })
})
