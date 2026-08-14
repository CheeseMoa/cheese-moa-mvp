import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  API_CACHE_FRESH_MS,
  clearApiCache,
  invalidateApiCacheKey,
  readApiCache,
  writeApiCache,
} from './apiCache'

/**
 * 캐시가 화면에 그대로 그려지는 값이라(useApi 첫 렌더) 규칙이 어긋나면 증상이 곧
 * "옛 데이터가 보인다"가 된다 — 신선도 경계·무효화·상한을 고정한다(CHMO-401).
 */
describe('apiCache', () => {
  beforeEach(() => {
    clearApiCache()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    clearApiCache()
  })

  it('쓴 값을 그대로 돌려준다 · 없는 키는 null', () => {
    writeApiCache('groups', [{ id: 1 }])
    expect(readApiCache<{ id: number }[]>('groups')?.data).toEqual([{ id: 1 }])
    expect(readApiCache('event:1')).toBeNull()
  })

  it('신선도 경계 — 그 안이면 fresh(재요청 없음), 지나면 stale(뒤에서 갱신)', () => {
    writeApiCache('event:1', { id: 1 })
    expect(readApiCache('event:1')?.fresh).toBe(true)

    // 경계 직전은 아직 신선
    vi.advanceTimersByTime(API_CACHE_FRESH_MS - 1)
    expect(readApiCache('event:1')?.fresh).toBe(true)

    // 경계를 넘으면 값은 남고 신선도만 꺼진다 — 화면은 이 값을 그리면서 갱신을 기다린다
    vi.advanceTimersByTime(1)
    const stale = readApiCache<{ id: number }>('event:1')
    expect(stale?.fresh).toBe(false)
    expect(stale?.data).toEqual({ id: 1 })
  })

  it('다시 쓰면 신선도가 되살아난다 — 갱신 응답이 곧 새 기준점', () => {
    writeApiCache('event:1', { id: 1, name: '옛' })
    vi.advanceTimersByTime(API_CACHE_FRESH_MS)
    expect(readApiCache('event:1')?.fresh).toBe(false)

    writeApiCache('event:1', { id: 1, name: '새' })
    const entry = readApiCache<{ name: string }>('event:1')
    expect(entry?.fresh).toBe(true)
    expect(entry?.data.name).toBe('새')
  })

  it('키 하나만 버린다 — refetch()가 쓰는 경로', () => {
    writeApiCache('event:1', 1)
    writeApiCache('event:2', 2)
    invalidateApiCacheKey('event:1')
    expect(readApiCache('event:1')).toBeNull()
    expect(readApiCache('event:2')?.data).toBe(2)
  })

  it('전량 비우기 — 뮤테이션 성공·로그아웃(다른 계정 데이터가 새면 안 된다)', () => {
    writeApiCache('groups', ['a'])
    writeApiCache('event:1', 1)
    clearApiCache()
    expect(readApiCache('groups')).toBeNull()
    expect(readApiCache('event:1')).toBeNull()
  })

  it('상한을 넘으면 가장 오래 안 쓴 것부터 버린다 — 읽기가 수명을 늘린다(LRU)', () => {
    // 상한(60)을 넘겨 채우되, 첫 키는 중간에 읽어 최근 사용으로 올려 둔다
    writeApiCache('keep', 'v')
    for (let i = 0; i < 40; i += 1) writeApiCache(`filler:${i}`, i)
    expect(readApiCache('keep')?.data).toBe('v') // 최근 사용으로 승격
    for (let i = 40; i < 80; i += 1) writeApiCache(`filler:${i}`, i)

    // 승격된 키는 살아남고, 가장 오래된 삽입분은 밀려났다
    expect(readApiCache('keep')?.data).toBe('v')
    expect(readApiCache('filler:0')).toBeNull()
    expect(readApiCache('filler:79')?.data).toBe(79)
  })
})
