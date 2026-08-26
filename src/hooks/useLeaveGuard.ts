import { useCallback, useEffect, useRef } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import type { BlockerFunction, NavigateOptions, To } from 'react-router-dom'

/**
 * 이탈 경고(CHMO-712) — 되돌릴 수 없는 작업이 도는 동안 화면을 떠나려는 시도를 잡는다.
 * 나가는 문이 둘이라 층도 둘이다:
 *
 * ① **브라우저 이탈**(새로고침·탭 닫기·주소창 이동) → `beforeunload` 기본 확인창.
 *    문구는 브라우저가 소유해 우리가 정할 수 없다(스팸 방지로 표준이 막았다).
 * ② **앱 내 라우팅 이동**(브라우저·하드웨어 뒤로가기 포함) → `useBlocker`로 멈춘다.
 *    무엇을 보여줄지는 화면 몫이라 blocker를 그대로 돌려준다.
 *
 * 함께 돌려주는 `leave`는 **화면이 스스로 내보내는 이동**용이다 — 막을 대상은 사용자의
 * 이탈이지 우리 이동이 아니다(업로드 성공 후 이벤트 상세로 보내기, 401 로그인 복귀 등).
 * 그냥 `navigate`를 쓰면 화면이 자기 성공 이동에 스스로 가로막힌다.
 *
 * 같은 경로로의 이동은 막지 않는다 — 화면이 그대로인데 확인을 묻는 꼴이 된다.
 */
export function useLeaveGuard(active: boolean) {
  const navigate = useNavigate()
  // 최신 active를 blocker 판정 시점에 읽는다 — 판정 함수를 매 렌더 새로 등록하지 않기 위해
  const activeRef = useRef(active)
  activeRef.current = active
  /** 화면이 스스로 나가는 중 — 되돌리지 않는다(이 이동으로 화면이 사라진다) */
  const bypassRef = useRef(false)

  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 구형 브라우저 호환 — 값은 무시되고 표준 문구가 뜬다
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])

  const blocker = useBlocker(
    useCallback<BlockerFunction>(
      ({ currentLocation, nextLocation }) =>
        !bypassRef.current &&
        activeRef.current &&
        currentLocation.pathname !== nextLocation.pathname,
      [],
    ),
  )

  const leave = useCallback(
    (to: To, options?: NavigateOptions) => {
      bypassRef.current = true
      navigate(to, options)
    },
    [navigate],
  )

  return { blocker, leave }
}
