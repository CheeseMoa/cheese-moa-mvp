import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'

/**
 * 마운트 여부 플래그 — 제출 중 화면을 떠난 뒤 뒤늦게 온 응답이
 * setState·토스트·이동을 실행하지 않게 catch/then에서 `alive.current`를 확인한다.
 * (StrictMode 재마운트에서도 effect가 true로 되돌려 정상 동작)
 */
export function useAlive(): MutableRefObject<boolean> {
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  return alive
}
