import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError } from '../api/client'

export interface UseApiResult<T> {
  data: T | null
  error: ApiRequestError | null
  loading: boolean
  /** 수동 재요청 */
  refetch: () => void
}

/** GET 성격 요청 하나 — src/api/ 도메인 함수에 AbortSignal만 이어 준다 */
export type ApiFetcher<T> = (signal: AbortSignal) => Promise<T>

/**
 * GET 성격의 단순 데이터 패칭 훅.
 * - key는 요청 정체성 — 바뀌면 다시 불러오고, null이면 요청하지 않음(조건부 패칭)
 * - fetcher는 src/api/ 도메인 함수를 signal만 물려 호출한다(CHMO-192 — 화면은 URL을 모른다)
 * - 뮤테이션(POST/PATCH/DELETE)은 도메인 함수를 직접 호출한다.
 */
export function useApi<T>(key: string | null, fetcher: ApiFetcher<T>): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiRequestError | null>(null)
  const [loading, setLoading] = useState<boolean>(key !== null)

  // 매 렌더 새 함수가 오더라도 effect가 재실행되지 않도록 ref로 고정
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  // refetch()가 이 값을 올리면 아래 effect가 다시 실행된다(수동 재요청).
  const [reloadTick, setReloadTick] = useState(0)
  const refetch = useCallback(() => setReloadTick((n) => n + 1), [])

  useEffect(() => {
    if (key === null) {
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
        const result = await fetcherRef.current(controller.signal)
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
  }, [key, reloadTick])

  return { data, error, loading, refetch }
}
