import type { ReactNode } from 'react'
import { useEscapeKey } from '../../hooks/useEscapeKey'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
}

/**
 * 하단 시트 (dc.html §10) — 상단 r24 + 그랩 핸들, 목록형 액션(사진 이동 09-1 등)용.
 * PhoneShell(relative) 내부에서 렌더해 프레임 하단에 붙는다.
 */
export function BottomSheet({ open, onClose, title, subtitle, children }: BottomSheetProps) {
  useEscapeKey(open, onClose)
  if (!open) return null
  return (
    <div onClick={onClose} className="absolute inset-0 z-40 bg-text/[.45]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 rounded-t-[24px] bg-cream px-5 pb-6 pt-3"
      >
        <div className="mx-auto h-1 w-11 rounded-full bg-border" aria-hidden="true" />
        {title && <h2 className="mt-4 text-base font-bold text-text">{title}</h2>}
        {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
        <div className="mt-2">{children}</div>
      </div>
    </div>
  )
}
