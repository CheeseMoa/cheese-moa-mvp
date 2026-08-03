import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext } from './toastContext'

const TOAST_DURATION_MS = 2500

/**
 * 전역 토스트 (dc.html §10) — text 배경 다크 필, 하단 중앙, 한 번에 1개.
 * 상단 중앙(CHMO-429)은 별로라는 피드백으로 하단 복귀(CHMO-585). CHMO-429가 피하려던 하단 고정
 * CTA 겹침은 오프셋으로 회피 — CTA 스택(pt-4 + 버튼 h-12 + pb-safe-9 ≈ 100px + safe-area)
 * 바로 위에 띄운다.
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
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(7rem+env(safe-area-inset-bottom,0px))] z-50 flex justify-center px-6"
        >
          <span className="rounded-full bg-text px-[22px] py-[13px] text-[13px] font-medium text-cream shadow-card">
            {message}
          </span>
        </div>
      )}
    </ToastContext.Provider>
  )
}
