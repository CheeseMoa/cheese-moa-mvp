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
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  useEscapeKey(open, onClose)
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="absolute inset-0 z-40 flex items-center justify-center bg-text/[.45] p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[310px] rounded-[20px] bg-cream p-[22px] shadow-card"
      >
        {title && <h2 className="text-[17px] font-bold text-text">{title}</h2>}
        {children}
      </div>
    </div>
  )
}
