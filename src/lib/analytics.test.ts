/**
 * 사용자 행동 추적 계약 테스트 (CHMO-660).
 *
 * 이 테스트가 지키는 것은 지표 정확도가 아니라 **값이 새지 않는다**는 보증이다 —
 * 라우트에 뷰어 토큰·초대 코드·로그인 일회용 코드가 박혀 있어서, 화면 진입 기록이
 * 경로를 그대로 실으면 분석 대시보드가 곧 사진 접근 경로가 된다(analytics.ts 머리 주석 ①).
 * 화이트리스트 방식이라 라우트가 늘어나도 값이 새지는 않지만, 대신 조용히 집계에서
 * 빠지므로 router.tsx와의 누락 대조까지 여기서 고정한다.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as amplitude from '@amplitude/analytics-browser'
import { screenOf, trackEvent, trackScreen, UNKNOWN_SCREEN, __resetAnalyticsForTest } from './analytics'

vi.mock('@amplitude/analytics-browser', () => ({
  init: vi.fn(),
  track: vi.fn(),
}))

beforeEach(() => {
  __resetAnalyticsForTest()
  vi.clearAllMocks()
})

describe('screenOf — 경로를 화면 코드로', () => {
  it('열쇠가 박힌 경로도 화면 코드만 남는다 (토큰·코드가 결과에 없다)', () => {
    // 이 토큰 하나로 그 모임 사진을 열람할 수 있다 — 절대 밖으로 나가면 안 되는 값
    expect(screenOf('/share/shr_grp1')).toBe('15-viewer-unlock')
    expect(screenOf('/share/shr_grp1/events')).toBe('15-L-viewer-events')
    expect(screenOf('/share/shr_grp1/events/4')).toBe('15-viewer-albums')
    expect(screenOf('/share/shr_grp1/events/4/albums/12')).toBe('16-viewer-photos')
    // 초대 코드
    expect(screenOf('/join/AbC123xyz')).toBe('02-1-join')

    for (const path of ['/share/shr_grp1', '/join/AbC123xyz']) {
      expect(screenOf(path)).not.toContain('shr_grp1')
      expect(screenOf(path)).not.toContain('AbC123xyz')
    }
  })

  it('식별자가 든 제작자 경로도 패턴으로 접힌다', () => {
    expect(screenOf('/groups/1')).toBe('05-group-detail')
    expect(screenOf('/groups/1/events/2')).toBe('08-event-detail')
    expect(screenOf('/groups/1/events/2/upload')).toBe('06-U-upload')
    expect(screenOf('/groups/1/events/2/publish')).toBe('14-publish-summary')
    expect(screenOf('/groups/1/events/2/albums/3')).toBe('09-album-detail')
    expect(screenOf('/parent/groups/1/events/2')).toBe('19-member-photos')
  })

  it('정적 경로가 파라미터 패턴을 이긴다 — /groups/new는 모임 상세가 아니다', () => {
    // SCREENS 배열의 순서에 달린 동작이라, 순서를 바꾸면 여기서 깨진다
    expect(screenOf('/groups/new')).toBe('03-group-create')
    expect(screenOf('/admin/groups')).toBe('admin-groups')
    expect(screenOf('/admin/groups/7')).toBe('admin-group-detail')
  })

  it('모르는 경로는 URL이 아니라 unknown이다', () => {
    // 화이트리스트에 없으면 경로를 대신 싣지 않는다 — 새 라우트가 생겨도 값이 안 새는 쪽으로 실패
    expect(screenOf('/some/unmapped/path/with-secret-token')).toBe(UNKNOWN_SCREEN)
    expect(screenOf('/groups/1/events/2/albums/3/extra')).toBe(UNKNOWN_SCREEN)
  })

  it('루트와 로그인은 같은 화면(01)이다', () => {
    expect(screenOf('/')).toBe('01-landing')
    expect(screenOf('/login')).toBe('01-landing')
  })
})

describe('키가 없으면 완전 no-op', () => {
  // 테스트 환경엔 VITE_AMPLITUDE_API_KEY가 없다 = 미설정 빌드와 같은 상태.
  // 이 보증이 있어야 키를 넣기 전까지 이 코드가 배포돼 있어도 무해하다(처리방침 §11 유지).
  it('trackEvent가 SDK를 부르지 않는다', () => {
    trackEvent('login_start', { provider: 'kakao' })
    expect(amplitude.track).not.toHaveBeenCalled()
  })

  it('trackScreen도 SDK를 부르지 않는다', () => {
    trackScreen('/share/shr_grp1')
    expect(amplitude.track).not.toHaveBeenCalled()
  })
})

describe('router.tsx와의 누락 대조', () => {
  it('정의된 모든 라우트가 화면 코드를 갖는다', () => {
    // router.tsx를 import하면 화면 컴포넌트 전체가 딸려 와 node 환경에서 무겁다 —
    // 텍스트로 읽어 path만 뽑는다. 라우트를 추가하고 SCREENS를 안 고치면 여기서 걸린다.
    const source = readFileSync(new URL('../router.tsx', import.meta.url), 'utf-8')
    const paths = [...source.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1])

    // 상대 경로 자식 라우트('groups', 'groups/:groupId')는 부모(/admin)와 합쳐야 완성되고,
    // 와일드카드('*')는 화면이 아니라 폴백이라 대조 대상이 아니다
    const absolute = paths.filter((p) => p.startsWith('/') && p !== '*')
    expect(absolute.length).toBeGreaterThan(20) // 정규식이 헛돌면(0건) 통과해 버리는 것 방지

    const missing = absolute.filter((p) => screenOf(p) === UNKNOWN_SCREEN)
    expect(missing).toEqual([])
  })
})
