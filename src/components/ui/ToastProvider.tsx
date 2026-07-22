import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext } from './toastContext'

const TOAST_DURATION_MS = 2500

/**
 * 전역 토스트 (dc.html §10) — text 배경 다크 필, 하단 중앙, 한 번에 1개.
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
          className="pointer-events-none fixed inset-x-0 bottom-safe-9 z-50 flex justify-center px-6"
        >
          <span className="rounded-full bg-text px-[22px] py-[13px] text-[13px] font-medium text-cream shadow-card">
            {message}
          </span>
        </div>
      )}
    </ToastContext.Provider>
  )
}
