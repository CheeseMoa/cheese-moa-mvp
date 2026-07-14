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
 * PhoneShell(relative) 내부에서 렌더해 프레임 안쪽만 덮는다.
 * 긴 화면에서 프레임이 뷰포트보다 자라도 시트가 화면 밖(프레임 맨 아래)에 열리지 않게,
 * 스크림 안 sticky 컨테이너(h-dvh, 프레임이 더 짧으면 max-h-full)로 현재 뷰포트 하단에 붙인다.
 */
export function BottomSheet({ open, onClose, title, subtitle, children }: BottomSheetProps) {
  useEscapeKey(open, onClose)
  if (!open) return null
  return (
    <div onClick={onClose} className="absolute inset-0 z-40 bg-text/[.45]">
      <div className="sticky top-0 flex h-dvh max-h-full flex-col justify-end">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className="rounded-t-[24px] bg-cream px-5 pb-6 pt-3"
        >
          <div className="mx-auto h-1 w-11 rounded-full bg-border" aria-hidden="true" />
          {title && <h2 className="mt-4 text-base font-bold text-text">{title}</h2>}
          {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </div>
  )
}
