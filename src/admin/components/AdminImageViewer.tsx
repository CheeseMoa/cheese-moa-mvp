import { useEffect } from 'react'
import { AdminCloseIcon } from './AdminCloseIcon'

/**
 * 이미지 크게 보기 (CHMO-862) — 신고 사진·첨부 스크린샷을 패널 폭(440)보다 크게 확인한다.
 * 서비스 `PhotoLightbox`를 쓰지 않는 이유는 격리 규칙(§2-2)과 함께, 그쪽이 폰 프레임·저장·스와이프를
 * 전제로 한 화면이라서다 — 여기서 필요한 건 한 장을 크게 보는 것뿐이다.
 *
 * 스크림·✕·ESC 어느 쪽으로든 닫힌다(잃을 것이 없는 오버레이).
 */
export function AdminImageViewer({
  url,
  alt,
  onClose,
}: {
  url: string
  alt: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-5 top-4 flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
      >
        <AdminCloseIcon size={22} />
      </button>
      <img
        src={url}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    </div>
  )
}
