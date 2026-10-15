import { useEffect, useRef, useState } from 'react'
import { ApiRequestError } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import type { AdminCursorPage } from '../api/types'

export interface CursorListResult<T, P extends AdminCursorPage<T>> {
  /** 첫 페이지 응답 원본 — 목록 밖 값(장수 잔액 등)은 여기서 읽는다 */
  first: P | null
  /** 첫 페이지 + [더 보기]로 이어 받은 페이지를 합친 행 */
  items: T[]
  hasNext: boolean
  loading: boolean
  error: ApiRequestError | null
  /** 첫 페이지부터 다시 — 이어 받은 페이지는 버린다 */
  refetch: () => void
  loadMore: () => void
  loadingMore: boolean
  moreError: ApiRequestError | null
}

/**
 * 커서 목록 (CHMO-931) — 사용자 검색·장부·기관 구독이 쓰는 BE `{items, nextCursor, hasNext}` 공용.
 *
 * 첫 페이지는 `useApi`(캐시·키 정체성 그대로)가 맡고, [더 보기]는 이 훅이 직접 받아 **첫 페이지
 * 응답의 정체성에 묶어** 둔다 — 키가 바뀌거나 refetch로 첫 페이지가 새로 오면 이어 받은 페이지는
 * 자연히 버려진다(뮤테이션 뒤 refetch에서 옛 페이지가 새 첫 페이지 아래 남지 않는다).
 */
export function useCursorList<T, P extends AdminCursorPage<T> = AdminCursorPage<T>>(
  key: string | null,
  fetchPage: (cursor: number | null, signal?: AbortSignal) => Promise<P>,
): CursorListResult<T, P> {
  const first = useApi<P>(key, (signal) => fetchPage(null, signal))
  const [extra, setExtra] = useState<{ base: P | null; pages: P[] }>({ base: null, pages: [] })
  const [more, setMore] = useState<{ loading: boolean; error: ApiRequestError | null }>({
    loading: false,
    error: null,
  })

  // 최신 fetcher·늦은 응답 차단 — 언마운트나 첫 페이지 교체 뒤 도착한 [더 보기] 응답은 버린다
  const fetchRef = useRef(fetchPage)
  fetchRef.current = fetchPage
  const seq = useRef(0)
  useEffect(() => {
    return () => {
      seq.current += 1
    }
  }, [])

  const pages = extra.base === first.data ? extra.pages : []
  const last = pages.length > 0 ? pages[pages.length - 1] : first.data
  const hasNext = last?.hasNext ?? false

  const loadMore = () => {
    if (!first.data || !last || !hasNext || more.loading) return
    const base = first.data
    const token = ++seq.current
    setMore({ loading: true, error: null })
    fetchRef
      .current(last.nextCursor)
      .then((page) => {
        if (token !== seq.current) return
        setExtra((prev) => ({ base, pages: prev.base === base ? [...prev.pages, page] : [page] }))
        setMore({ loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (token !== seq.current) return
        setMore({
          loading: false,
          error: err instanceof ApiRequestError ? err : new ApiRequestError(0, 'NETWORK', '불러오지 못했어요.'),
        })
      })
  }

  return {
    first: first.data,
    items: [...(first.data?.items ?? []), ...pages.flatMap((page) => page.items)],
    hasNext,
    loading: first.loading,
    error: first.error,
    refetch: first.refetch,
    loadMore,
    loadingMore: more.loading,
    moreError: more.error,
  }
}
