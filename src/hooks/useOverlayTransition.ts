import { useEffect, useRef, useState } from 'react'
import { MOTION_DURATION, prefersReducedMotion } from '../lib/motion'

/**
 * 오버레이 퇴장 전환(CHMO-711) — `open`이 false가 돼도 퇴장 애니메이션이 끝날 때까지
 * 마운트를 유지한다. 종전 오버레이는 `if (!open) return null`이라 닫힘이 구조적으로
 * 전환을 탈 수 없었다(열릴 때만 애니메이션을 붙이면 반쪽이라 더 어색하다).
 *
 * reduced-motion이면 기다리지 않고 곧장 언마운트한다 — 전역 CSS가 애니메이션을 이미
 * 걷어내서, 기다려 봐야 빈 화면이 그 시간만큼 남을 뿐이다.
 *
 * 반환값: `mounted`는 그릴지, `leaving`은 퇴장 중인지(퇴장 클래스·클릭 차단에 쓴다).
 */
export function useOverlayTransition(open: boolean, exitMs: number = MOTION_DURATION.fast) {
  const [rendered, setRendered] = useState(open)
  const timerRef = useRef<number>()

  useEffect(() => {
    window.clearTimeout(timerRef.current)
    if (open) {
      setRendered(true)
      return
    }
    if (prefersReducedMotion()) {
      setRendered(false)
      return
    }
    timerRef.current = window.setTimeout(() => setRendered(false), exitMs)
  }, [open, exitMs])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  // open이 막 true가 된 렌더에서도 바로 그린다 — effect를 기다리면 등장이 한 프레임 늦는다
  return { mounted: open || rendered, leaving: rendered && !open }
}
