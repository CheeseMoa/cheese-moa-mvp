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

  const run = useCallback(async () => {
    if (path === null) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<T>(path, optionsRef.current)
      setData(result)
    } catch (e) {
      setError(
        e instanceof ApiRequestError ? e : new ApiRequestError(0, 'NETWORK_ERROR', String(e)),
      )
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => {
    void run()
  }, [run])

  return { data, error, loading, refetch: run }
}
