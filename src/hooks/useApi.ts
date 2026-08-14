import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError } from '../api/client'
import { invalidateApiCacheKey, readApiCache, writeApiCache } from '../lib/apiCache'

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
 *
 * **응답은 key 단위로 캐시된다**(CHMO-401 — `lib/apiCache`): 같은 key로 다시 마운트되면
 * 캐시 값으로 **첫 렌더부터** 그리고, 신선하지 않을 때만 뒤에서 갱신한다. 그래서 05↔08↔09
 * 왕복에 로딩 화면이 끼지 않는다. 무효화는 뮤테이션·로그아웃이 전량으로 한다(캐시 모듈 주석).
 */
export function useApi<T>(key: string | null, fetcher: ApiFetcher<T>): UseApiResult<T> {
  // 캐시를 effect에서 읽으면(페인트 후) 화면이 한 프레임 비었다가 값이 들어와 깜빡인다 —
  // 첫 렌더 초기값으로 읽는다. 마운트 이후의 key 변경은 아래 effect가 잇는다.
  const [data, setData] = useState<T | null>(() =>
    key === null ? null : (readApiCache<T>(key)?.data ?? null),
  )
  const [error, setError] = useState<ApiRequestError | null>(null)
  // 신선한 캐시가 있으면 요청 자체를 안 하므로 로딩도 아니다
  const [loading, setLoading] = useState<boolean>(() => key !== null && !readApiCache(key)?.fresh)

  // 매 렌더 새 함수가 오더라도 effect가 재실행되지 않도록 ref로 고정
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  // refetch()가 이 값을 올리면 아래 effect가 다시 실행된다(수동 재요청).
  const [reloadTick, setReloadTick] = useState(0)
  // 명시적 재요청은 신선도와 무관하게 서버를 봐야 한다 — 캐시 항목을 버려서 아래 effect가
  // 자연히 요청을 태우게 한다(폴링·성공 후 갱신이 이 경로다). '강제' 플래그로 두지 않는 이유는
  // 캐시 모듈 주석 참조(StrictMode 이중 실행에서 한쪽이 플래그를 먹는다).
  const refetch = useCallback(() => {
    if (key !== null) invalidateApiCacheKey(key)
    setReloadTick((n) => n + 1)
  }, [key])

  useEffect(() => {
    if (key === null) {
      setLoading(false)
      return
    }
    const cached = readApiCache<T>(key)
    if (cached) {
      // key가 바뀌어 들어온 경우를 맞춘다(첫 렌더는 초기값이 이미 같은 값이라 무해한 재설정)
      setData(cached.data)
      setError(null)
      // 신선하면 여기서 끝 — 요청도, 그에 딸린 썸네일 URL 교체도 없다(CHMO-465)
      if (cached.fresh) {
        setLoading(false)
        return
      }
    }
    // 이 요청 전용 정지 컨트롤러. cleanup에서 abort()로 요청 자체를 취소한다.
    // controller.signal.aborted가 곧 "이 요청은 더는 유효하지 않음" 표시(= 이전 active 플래그 역할).
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const load = async () => {
      try {
        const result = await fetcherRef.current(controller.signal)
        if (!controller.signal.aborted) {
          writeApiCache(key, result)
          setData(result)
        }
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
