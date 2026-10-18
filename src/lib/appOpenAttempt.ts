/**
 * 초대에서 외부 앱을 연 뒤의 대기·복귀 처리(CHMO-953).
 * 웹은 설치 여부나 실행 성공을 알 수 없다. 시간이 지나도 스토어로 이동하지 않고
 * 수동 복구를 안내한다. 숨김·pagehide·BFCache 복귀 모두 대기를 해제한다.
 */
export type AppOpenState = 'idle' | 'opening' | 'help' | 'store' | 'returned'

export const APP_OPEN_HELP_DELAY_MS = 1500

export function createAppOpenAttempt(onStateChange: (state: AppOpenState) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let attempted = false
  let disposed = false

  const clearTimer = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const finish = (state: AppOpenState) => {
    clearTimer()
    if (!disposed) onStateChange(state)
  }
  const onReturn = () => {
    if (attempted) finish('returned')
  }

  // hidden에서도 대기를 풀어 둔다. pageshow만 발생하는 Safari BFCache 복귀도 받는다.
  document.addEventListener('visibilitychange', onReturn)
  window.addEventListener('pagehide', onReturn)
  window.addEventListener('pageshow', onReturn)

  return {
    open(url: string | null) {
      if (disposed) return
      attempted = true
      clearTimer()
      if (!url) {
        finish('help')
        return
      }
      onStateChange('opening')
      timer = setTimeout(() => finish('help'), APP_OPEN_HELP_DELAY_MS)
      try {
        window.location.assign(url)
      } catch {
        finish('help')
      }
    },
    /** 앵커의 기본 이동을 유지해 초대 페이지를 방문 기록에 남긴다. */
    prepareStore() {
      if (disposed) return
      attempted = true
      finish('store')
    },
    dispose() {
      disposed = true
      clearTimer()
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('pagehide', onReturn)
      window.removeEventListener('pageshow', onReturn)
    },
  }
}
