import { useEffect, useState } from 'react'

/**
 * 로딩 표시를 미루는 기본 시간(ms) — 이 안에 끝나는 요청은 표시 자체를 건너뛴다.
 *
 * 목 모드·웜 서버(실측 TTFB ~300ms)에선 로딩 문구가 수십~수백 ms만 떴다 사라져 정보는 못 주고
 * 깜빡임만 남긴다("로딩중이라는 문구가 너무 빨리 넘어가서 제대로 못 봤다" — CHMO-401).
 * 250ms는 사람이 '멈췄다'고 느끼기 시작하는 문턱이라, 넘겼다면 그때는 문구가 정보가 된다.
 */
export const LOADING_INDICATOR_DELAY_MS = 250

/**
 * `on`이 delayMs보다 오래 켜져 있을 때만 true — 짧게 스쳐 가는 상태를 화면에서 지운다.
 * 꺼지는 건 즉시다(도착한 순간 표시가 남아 있으면 안 된다).
 */
export function useDelayedFlag(on: boolean, delayMs: number = LOADING_INDICATOR_DELAY_MS): boolean {
  const [elapsed, setElapsed] = useState(false)

  useEffect(() => {
    if (!on) {
      setElapsed(false)
      return
    }
    const timer = setTimeout(() => setElapsed(true), delayMs)
    return () => clearTimeout(timer)
  }, [on, delayMs])

  // `on &&` — 꺼진 렌더에서 즉시 false다(setElapsed(false)는 effect라 한 박자 늦는다)
  return on && elapsed
}
