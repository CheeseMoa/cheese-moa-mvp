import type { ReactNode } from 'react'
import { useEscapeKey } from '../../hooks/useEscapeKey'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/**
 * 중앙 모달 (dc.html §09). PhoneShell(relative) 내부에서 렌더해 프레임 안쪽만 덮는다.
 * 스크림 rgba(text, .45) 탭 또는 ESC로 닫힘.
 * 긴 화면에서 프레임이 뷰포트보다 자라도 대화상자가 화면 밖(프레임 중앙)에 열리지 않게,
 * 스크림 안 sticky 컨테이너(h-dvh, 프레임이 더 짧으면 max-h-full)로 현재 뷰포트 중앙에 띄운다.
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  useEscapeKey(open, onClose)
  if (!open) return null
  return (
    <div onClick={onClose} className="absolute inset-0 z-40 bg-text/[.45]">
      <div className="sticky top-0 flex h-dvh max-h-full items-center justify-center p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[310px] rounded-[20px] bg-cream p-[22px] shadow-card"
        >
          {title && <h2 className="text-[17px] font-bold text-text">{title}</h2>}
          {children}
        </div>
      </div>
    </div>
  )
}
