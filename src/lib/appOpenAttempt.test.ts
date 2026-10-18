import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_OPEN_HELP_DELAY_MS, createAppOpenAttempt } from './appOpenAttempt'

describe('초대 앱 열기 시도', () => {
  let page: EventTarget
  let documentEvents: EventTarget
  let navigate: ReturnType<typeof vi.fn>
  let state: ReturnType<typeof vi.fn>
  let attempt: ReturnType<typeof createAppOpenAttempt>

  beforeEach(() => {
    vi.useFakeTimers()
    page = new EventTarget()
    documentEvents = new EventTarget()
    navigate = vi.fn()
    state = vi.fn()
    vi.stubGlobal('window', Object.assign(page, { location: { assign: navigate } }))
    vi.stubGlobal('document', documentEvents)
    attempt = createAppOpenAttempt(state)
  })

  afterEach(() => {
    attempt.dispose()
    vi.useRealTimers()
  })

  it('사용자 조작 전에는 이동하지 않고, 무응답이면 재시도 안내만 표시한다', () => {
    page.dispatchEvent(new Event('pageshow'))
    expect(navigate).not.toHaveBeenCalled()
    expect(state).not.toHaveBeenCalled()
    attempt.open('cheesemoa://join/ABC123?name=picnic')
    expect(state).toHaveBeenLastCalledWith('opening')
    vi.advanceTimersByTime(APP_OPEN_HELP_DELAY_MS)
    expect(state).toHaveBeenLastCalledWith('help')
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('cheesemoa://join/ABC123?name=picnic')
  })

  it.each(['visibilitychange', 'pagehide', 'pageshow'])(
    '%s 때 버튼 대기를 풀고 타이머를 취소해 복귀 후 스토어로 튕기지 않는다',
    (event) => {
      attempt.open('cheesemoa://join/ABC123')
      const target = event === 'visibilitychange' ? documentEvents : page
      target.dispatchEvent(new Event(event))
      expect(state).toHaveBeenLastCalledWith('returned')
      vi.advanceTimersByTime(APP_OPEN_HELP_DELAY_MS * 2)
      expect(state).toHaveBeenLastCalledWith('returned')
      expect(navigate).toHaveBeenCalledTimes(1)
    },
  )

  it('빠르게 다시 눌러도 이전 타이머가 새 시도를 끝내지 않는다', () => {
    attempt.open('cheesemoa://join/ABC123')
    vi.advanceTimersByTime(1000)
    attempt.open('cheesemoa://join/ABC123')
    vi.advanceTimersByTime(1000)
    expect(state).toHaveBeenLastCalledWith('opening')
    vi.advanceTimersByTime(500)
    expect(state).toHaveBeenLastCalledWith('help')
  })

  it('스토어를 직접 누르면 앱 열기 타이머를 취소하고 복귀를 안내한다', () => {
    attempt.open('cheesemoa://join/ABC123')
    attempt.prepareStore()
    vi.advanceTimersByTime(APP_OPEN_HELP_DELAY_MS)
    expect(state).toHaveBeenLastCalledWith('store')
    expect(navigate).toHaveBeenCalledTimes(1)
    page.dispatchEvent(new Event('pageshow'))
    expect(state).toHaveBeenLastCalledWith('returned')
  })

  it('스킴 이동이 예외로 거부돼도 재시도할 수 있다', () => {
    navigate.mockImplementationOnce(() => {
      throw new Error('blocked')
    })
    attempt.open('cheesemoa://join/ABC123')
    expect(state).toHaveBeenLastCalledWith('help')
    attempt.open('cheesemoa://join/ABC123')
    expect(state).toHaveBeenLastCalledWith('opening')
    expect(navigate).toHaveBeenCalledTimes(2)
  })

  it('경로가 없어도 임의 스토어 이동 없이 복구를 안내한다', () => {
    attempt.open(null)
    expect(state).toHaveBeenLastCalledWith('help')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('화면을 떠나면 타이머·이벤트 구독을 정리한다', () => {
    attempt.open('cheesemoa://join/ABC123')
    attempt.dispose()
    state.mockClear()
    page.dispatchEvent(new Event('pageshow'))
    page.dispatchEvent(new Event('pagehide'))
    documentEvents.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(APP_OPEN_HELP_DELAY_MS)
    attempt.open('cheesemoa://join/OTHER1')
    attempt.prepareStore()
    expect(state).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledTimes(1)
  })
})
