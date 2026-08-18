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
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as amplitude from '@amplitude/analytics-browser'
import {
  isAnalyticsOptedOut,
  screenOf,
  setAnalyticsOptOut,
  trackEvent,
  trackScreen,
  UNKNOWN_SCREEN,
  __resetAnalyticsForTest,
} from './analytics'

vi.mock('@amplitude/analytics-browser', () => ({
  init: vi.fn(),
  track: vi.fn(),
  setOptOut: vi.fn(),
  // 페이지를 떠날 때 beacon으로 밀어내는 경로(endScreenSession) — 실제 모듈에 있는 API다
  setTransport: vi.fn(),
  flush: vi.fn(),
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

describe('수집 거부(옵트아웃, CHMO-662) — 처리방침 §12 거부 방법의 실체', () => {
  it('플래그가 기기 단위로 저장·복원된다 (설정 토글의 재방문 상태)', () => {
    expect(isAnalyticsOptedOut()).toBe(false)
    setAnalyticsOptOut(true)
    expect(isAnalyticsOptedOut()).toBe(true)
    setAnalyticsOptOut(false)
    expect(isAnalyticsOptedOut()).toBe(false)
  })

  it('거부 상태에선 키가 있어도 SDK를 초기화하지 않는다', async () => {
    // API_KEY는 모듈 로드 시점에 읽힌다 — env를 심고 새 인스턴스를 받아야 키가 보인다
    vi.stubEnv('VITE_AMPLITUDE_API_KEY', 'test-key')
    vi.resetModules()
    try {
      const analytics = await import('./analytics')
      // resetModules 이후의 목 인스턴스 — 상단 import(구 인스턴스)로는 호출이 안 잡힌다
      const amp = await import('@amplitude/analytics-browser')
      analytics.setAnalyticsOptOut(true)
      await analytics.initAnalytics()
      expect(amp.init).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it('세션 중에 다시 켜면 건너뛴 초기화가 이어진다', async () => {
    vi.stubEnv('VITE_AMPLITUDE_API_KEY', 'test-key')
    vi.resetModules()
    try {
      const analytics = await import('./analytics')
      const amp = await import('@amplitude/analytics-browser')
      analytics.setAnalyticsOptOut(true)
      await analytics.initAnalytics() // 거부 상태 — 건너뜀
      expect(amp.init).not.toHaveBeenCalled()
      analytics.setAnalyticsOptOut(false) // 토글 켜기 — 내부에서 init 재시도
      await vi.waitFor(() => expect(amp.init).toHaveBeenCalledTimes(1))
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})

/**
 * 체류·이탈 계측 (CHMO-691).
 *
 * 관찰 방법에 두 가지 제약이 있다 — ① 키가 없으면 모듈이 통째로 no-op라 아무것도 안 나오고,
 * ② DEV에서는 전송 대신 `console.info`로 빠진다(개발 트래픽이 지표를 흐리지 않게).
 * 그래서 키를 심어 새 모듈 인스턴스를 받고, payload는 그 로그로 읽는다.
 * 계산(화면 코드 환산·체류 시간·프로퍼티 선별)은 전부 그 분기보다 앞에서 끝나므로
 * 여기서 보는 값이 실제로 전송될 값과 같다.
 */
describe('화면 체류·이탈 (CHMO-691)', () => {
  let restoreLog: (() => void) | null = null

  async function harness() {
    vi.stubEnv('VITE_AMPLITUDE_API_KEY', 'test-key')
    vi.resetModules()
    const analytics = await import('./analytics')
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    restoreLog = () => log.mockRestore()
    const emitted = () =>
      log.mock.calls
        .filter((call) => call[0] === '[analytics]')
        .map((call) => [call[1] as string, call[2] as Record<string, unknown>] as const)
    return { analytics, emitted }
  }

  afterEach(() => {
    restoreLog?.()
    restoreLog = null
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('화면을 옮기면 직전 화면이 체류 시간과 함께 마감된다', async () => {
    vi.useFakeTimers()
    const { analytics, emitted } = await harness()

    analytics.trackScreen('/home')
    vi.advanceTimersByTime(3_000)
    analytics.trackScreen('/groups/1')

    // view↔leave가 짝을 이뤄야 퍼널이 "몇 초 보고 나갔나"를 계산할 수 있다
    expect(emitted().map(([event, props]) => [event, props.screen, props.duration_ms])).toEqual([
      ['screen_view', '02-home', undefined],
      ['screen_leave', '02-home', 3_000],
      ['screen_view', '05-group-detail', undefined],
    ])
  })

  it('같은 화면이 연달아 들어오면 마감도 진입도 없다', async () => {
    const { analytics, emitted } = await harness()

    // 한 번의 이동에 router.subscribe가 여러 번 불린다 — 그때마다 체류가 끊기면 안 된다
    analytics.trackScreen('/home')
    analytics.trackScreen('/home')

    expect(emitted().map(([event]) => event)).toEqual(['screen_view'])
  })

  it('탭을 열어 둔 채 잊은 체류는 30분에서 잘린다', async () => {
    vi.useFakeTimers()
    const { analytics, emitted } = await harness()

    analytics.trackScreen('/home')
    vi.advanceTimersByTime(3 * 60 * 60 * 1000) // 3시간 방치
    analytics.endScreenSession()

    // 캡이 없으면 이런 한 건이 평균 체류를 통째로 망가뜨린다
    const leave = emitted().find(([event]) => event === 'screen_leave')
    expect(leave?.[1].duration_ms).toBe(30 * 60 * 1000)
  })

  it('pagehide와 visibilitychange가 겹쳐 와도 한 번만 마감한다', async () => {
    const { analytics, emitted } = await harness()

    analytics.trackScreen('/home')
    analytics.endScreenSession()
    analytics.endScreenSession()

    expect(emitted().filter(([event]) => event === 'screen_leave')).toHaveLength(1)
  })

  it('백그라운드에 있던 시간은 체류로 세지 않는다', async () => {
    vi.useFakeTimers()
    const { analytics, emitted } = await harness()

    analytics.trackScreen('/home')
    vi.advanceTimersByTime(2_000)
    analytics.endScreenSession() // 앱을 접었다
    vi.advanceTimersByTime(10 * 60 * 1000) // 10분 뒤
    analytics.resumeScreenSession() // 돌아왔다 — 여기서 다시 센다
    vi.advanceTimersByTime(1_000)
    analytics.endScreenSession()

    // 접어 둔 10분이 어느 쪽에도 안 들어간다(안 그러면 "이 화면에 오래 머물렀다"가 된다)
    expect(
      emitted()
        .filter(([event]) => event === 'screen_leave')
        .map(([, props]) => props.duration_ms),
    ).toEqual([2_000, 1_000])
  })

  it('막힌 지점 기록에 BE 메시지가 실리지 않는다', async () => {
    const { analytics, emitted } = await harness()

    // 실제 ApiRequestError는 Error라 message를 들고 다니고, 거기 인물명이 섞일 수 있다 —
    // 통째로 넘겨도 새지 않아야 한다(그래서 호출부가 아니라 analytics가 프로퍼티를 고른다)
    const error = { status: 404, code: 'ALBUM_NOT_FOUND', message: "'김민준' 앨범이 없습니다" }
    analytics.trackErrorShown('/groups/1/events/2/albums/3', error)

    const [[event, props]] = emitted()
    expect(event).toBe('error_shown')
    expect(props).toMatchObject({ screen: '09-album-detail', code: 'ALBUM_NOT_FOUND', status: 404 })
    expect(props.message).toBeUndefined()
    // 경로에 든 식별자(1·2·3)도 화면 코드로 접혀 나간다 — 이름은 어디에도 없다
    expect(JSON.stringify(props)).not.toContain('김민준')
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

/**
 * 앱 첫 실행 (CHMO-704) — 다운로드 랜딩(`cheese-moa.com/get`)의 마지막 짝.
 *
 * 이 이벤트가 지켜야 하는 건 정확도가 아니라 **셈의 성질**이다. 기기당 딱 한 번이라야
 * 랜딩 클릭 수와 나란히 놓고 볼 수 있고, 한 번이 아니게 되는 순간(브라우저에서도 발화하거나
 * 매 실행마다 발화하면) 숫자가 부풀어 대조 자체가 무의미해진다.
 *
 * 체류 테스트와 같은 제약을 받는다 — 키가 없으면 모듈이 통째로 no-op이고 DEV에서는
 * 전송 대신 `console.info`로 빠진다. 그래서 키를 심어 새 인스턴스를 받고 로그로 읽는다.
 */
describe('앱 첫 실행 (CHMO-704)', () => {
  const APP_UA = 'Mozilla/5.0 (Linux; Android 14) CheeseMoaApp/1.2.0 (android) Bridge/1'
  const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1'
  let restoreLog: (() => void) | null = null

  async function harness(userAgent: string) {
    vi.stubGlobal('navigator', { userAgent, maxTouchPoints: 0 })
    vi.stubEnv('VITE_AMPLITUDE_API_KEY', 'test-key')
    vi.resetModules()
    const analytics = await import('./analytics')
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    restoreLog = () => log.mockRestore()
    const emitted = () =>
      log.mock.calls.filter((call) => call[0] === '[analytics]').map((call) => call[1] as string)
    return { analytics, emitted }
  }

  afterEach(() => {
    restoreLog?.()
    restoreLog = null
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('앱 웹뷰에서 처음 열면 1회 발화한다', async () => {
    const { analytics, emitted } = await harness(APP_UA)

    analytics.trackAppFirstOpen()

    expect(emitted()).toEqual(['app_first_open'])
  })

  it('같은 기기에서 다시 열면 발화하지 않는다', async () => {
    const { analytics, emitted } = await harness(APP_UA)

    analytics.trackAppFirstOpen()
    analytics.trackAppFirstOpen() // 두 번째 실행 — 기기 플래그가 남아 있다

    // 두 번 세면 "설치 수"가 "실행 수"가 돼 랜딩 클릭과 대조할 수 없다
    expect(emitted()).toEqual(['app_first_open'])
  })

  it('일반 브라우저에서는 발화하지 않는다', async () => {
    const { analytics, emitted } = await harness(BROWSER_UA)

    analytics.trackAppFirstOpen()

    // 웹앱 방문은 이미 screen_view(surface=web)로 잡힌다 — 이 이벤트가 세는 건 앱 설치다
    expect(emitted()).toEqual([])
  })

  it('수집 거부 상태에서는 발화하지도, 저장소를 건드리지도 않는다', async () => {
    const { analytics, emitted } = await harness(APP_UA)

    analytics.setAnalyticsOptOut(true)
    analytics.trackAppFirstOpen()

    expect(emitted()).toEqual([])
    // 거부한 사람의 기기에 추적용 값을 남기지 않는다 — 남기면 나중에 켜도 영영 안 잡힌다
    expect(localStorage.getItem('cheesemoa.analytics.appFirstOpen')).toBeNull()
  })
})
