import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext } from './toastContext'

const TOAST_DURATION_MS = 2500

/**
 * 전역 토스트 (dc.html §10) — text 배경 다크 필, 하단 중앙, 한 번에 1개.
 * 상단 중앙(CHMO-429)은 별로라는 피드백으로 하단 복귀(CHMO-585). CHMO-429가 피하려던 하단 고정
 * CTA 겹침은 오프셋으로 회피 — CTA 스택(pt-4 + 버튼 h-12 + pb-safe-9 ≈ 100px + safe-area)
 * 바로 위에 띄운다.
 * 오프셋의 기준은 뷰포트가 아니라 **폰 프레임**이다(CHMO-596): fixed로 뷰포트 바닥에서 재면
 * 데스크톱(sm+)에선 상단 정렬 844px 프레임(PhoneShell)과 바닥이 어긋나 창 높이에 따라 토스트가
 * 프레임 안 CTA 버튼을 덮거나 프레임 밖에 떨어진다. 그래서 PhoneShell과 같은 박스
 * (h-dvh / sm:my-6 sm:h-[844px] / max-w-phone)를 재현한 고스트 프레임 안에 절대 배치한다 —
 * 모바일(<sm)은 프레임=뷰포트라 동작 동일. PhoneShell 프레임 치수가 바뀌면 여기도 함께 바꾼다.
 * 앱 루트(main.tsx)에서 라우터를 감싼다. 사용은 useToast().show('🧀 …').
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<number>()

  const show = useCallback((next: string) => {
    setMessage(next)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setMessage(null), TOAST_DURATION_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message && (
        <div className="pointer-events-none fixed inset-0 z-50 flex justify-center">
          {/* 고스트 프레임 — PhoneShell 프레임 박스의 복제(치수 동기 필수) */}
          <div className="relative h-dvh w-full max-w-phone sm:my-6 sm:h-[844px]">
            <div
              role="status"
              className="absolute inset-x-0 bottom-[calc(7rem+env(safe-area-inset-bottom,0px))] flex justify-center px-6"
            >
              <span className="rounded-full bg-text px-[22px] py-[13px] text-[13px] font-medium text-cream shadow-card">
                {message}
              </span>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
