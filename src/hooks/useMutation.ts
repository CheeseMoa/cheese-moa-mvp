import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { redirectIfUnauthorized, toErrorMessage } from '../api/client'
import { useAlive } from './useAlive'

interface MutationHandlers<T> {
  /** await 성공 후 실행 — 언마운트 상태면 호출되지 않는다(늦은 응답 차단) */
  onSuccess: (result: T) => void
  /** 실패 후 실행 — 401 리다이렉트가 일어나면 호출되지 않는다. 정규화된 한국어 메시지를 받는다 */
  onError?: (message: string, err: unknown) => void
  /** 401 복귀 목적지·state (뷰어 `to`·초대 `returnTo`). 생략 시 /login */
  redirect?: { to?: string; state?: unknown }
  /** 401을 리다이렉트하지 않고 onError로만 처리(로그인·잠금 해제 폼 — 401 = 자격 오류) */
  noAuthRedirect?: boolean
}

/**
 * 뮤테이션 공용 스켈레톤 — unmount 가드 + 401 리다이렉트 + 에러 메시지 정규화를 소유한다(CHMO-181).
 * busy 상태·성공 후속·에러 표시(toast/setError) 방식은 호출부가 그대로 소유하므로 화면별 동작이 보존된다.
 *
 * 각 화면의 handle* 함수엔 성공/실패 후속 로직만 남는다:
 *   const mutate = useMutation()
 *   setBusy(true)
 *   await mutate(() => deletePhotos(...), {
 *     onSuccess: () => { ...; setBusy(false) },
 *     onError: (msg) => { toast.show(msg); setBusy(false) },
 *   })
 */
export function useMutation() {
  const navigate = useNavigate()
  const alive = useAlive()
  return useCallback(
    async function mutate<T>(
      task: () => Promise<T>,
      handlers: MutationHandlers<T>,
    ): Promise<void> {
      try {
        const result = await task()
        if (!alive.current) return
        handlers.onSuccess(result)
      } catch (err) {
        if (!alive.current) return
        if (!handlers.noAuthRedirect && redirectIfUnauthorized(err, navigate, handlers.redirect))
          return
        handlers.onError?.(toErrorMessage(err), err)
      }
    },
    [navigate, alive],
  )
}
