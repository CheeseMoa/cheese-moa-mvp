import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, ApiRequestError, type ApiOptions } from '../lib/api'

export interface UseApiResult<T> {
  data: T | null
  error: ApiRequestError | null
  loading: boolean
  /** 수동 재요청 */
  refetch: () => void
}

/**
 * GET 성격의 단순 데이터 패칭 훅.
 * - path가 null이면 요청하지 않음(조건부 패칭)
 * - 뮤테이션(POST/PATCH/DELETE)은 apiFetch를 직접 호출한다.
 */
export function useApi<T>(path: string | null, options?: ApiOptions): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiRequestError | null>(null)
  const [loading, setLoading] = useState<boolean>(path !== null)

  // 매 렌더 새 객체가 오더라도 effect가 재실행되지 않도록 ref로 고정
  const optionsRef = useRef(options)
  optionsRef.current = options

  // refetch()가 이 값을 올리면 아래 effect가 다시 실행된다(수동 재요청).
  const [reloadTick, setReloadTick] = useState(0)
  const refetch = useCallback(() => setReloadTick((n) => n + 1), [])

  useEffect(() => {
    if (path === null) {
      setLoading(false)
      return
    }
    // 이 요청 전용 정지 컨트롤러. cleanup에서 abort()로 요청 자체를 취소한다.
    // controller.signal.aborted가 곧 "이 요청은 더는 유효하지 않음" 표시(= 이전 active 플래그 역할).
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const load = async () => {
      try {
        const result = await apiFetch<T>(path, {
          ...optionsRef.current,
          signal: controller.signal,
        })
        if (!controller.signal.aborted) setData(result)
      } catch (e) {
        // abort()로 인한 취소는 정상 흐름 — 에러로 표시하지 않는다.
        if (controller.signal.aborted) return
        setError(
          e instanceof ApiRequestError ? e : new ApiRequestError(0, 'NETWORK_ERROR', String(e)),
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => {
      controller.abort()
    }
  }, [path, reloadTick])

  return { data, error, loading, refetch }
}
