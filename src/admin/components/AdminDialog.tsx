import { useEffect, type ReactNode } from 'react'

/**
 * 어드민 폼 다이얼로그 (CHMO-931) — 확인 다이얼로그(`AdminConfirmDialog`)가 문장만 담는 것과
 * 달리 입력칸을 담는다(장수 조정·구독 기간 등록·개통). 바닥은 같다: 데스크탑 폭(max-w-lg) ·
 * ESC·스크림 탭은 닫기(머무르기) · 전송 중엔 닫히지 않는다.
 *
 * 버튼은 호출부가 `footer`로 넣는다 — 폼마다 확정 조건(검증 통과·전송 중)이 달라 여기서 잠글 수 없다.
 */
export function AdminDialog({
  title,
  description,
  children,
  footer,
  onClose,
  busy,
  widthClassName = 'max-w-lg',
}: {
  title: string
  /** 제목 아래 한 줄 — 이 다이얼로그가 하는 일의 결과 */
  description?: ReactNode
  children: ReactNode
  footer: ReactNode
  onClose: () => void
  /** 전송 중 — ESC·스크림으로 못 닫는다(같은 요청이 두 번 나가거나 결과를 못 보는 일 방지) */
  busy?: boolean
  widthClassName?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-full w-full flex-col rounded-xl border border-admin-border bg-admin-surface shadow-lg ${widthClassName}`}
      >
        <div className="px-6 pt-5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-[13px] leading-relaxed text-admin-muted">{description}</p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-admin-border px-6 py-4">{footer}</div>
      </div>
    </div>
  )
}

/** 다이얼로그 하단 버튼 한 쌍 — 닫기(secondary) + 확정(primary). 전송 중엔 둘 다 잠근다 */
export function AdminDialogActions({
  cancelLabel = '취소',
  confirmLabel,
  busyLabel = '처리 중…',
  onCancel,
  onConfirm,
  busy,
  confirmDisabled,
  confirmTone = 'primary',
}: {
  cancelLabel?: string
  confirmLabel: string
  busyLabel?: string
  onCancel: () => void
  onConfirm: () => void
  busy?: boolean
  confirmDisabled?: boolean
  /** `warn`은 되돌리기 어려운 결과(회수·무효화) — 서비스 warn 색을 보더로만 쓴다 */
  confirmTone?: 'primary' | 'warn'
}) {
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="h-9 rounded-lg border border-admin-border bg-admin-surface px-4 text-[13px] text-admin-text hover:bg-admin-bg disabled:opacity-40"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || confirmDisabled}
        className={`h-9 rounded-lg border px-4 text-[13px] font-semibold disabled:opacity-60 ${
          confirmTone === 'warn'
            ? 'border-warn bg-admin-surface text-warn hover:bg-warn/5'
            : 'border-primary bg-primary text-admin-text hover:brightness-95'
        }`}
      >
        {busy ? busyLabel : confirmLabel}
      </button>
    </>
  )
}
