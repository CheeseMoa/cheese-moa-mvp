import { useEffect } from 'react'

interface AdminConfirmDialogProps {
  title: string
  /** 그렇게 하면 무슨 일이 일어나는지 — 문장 배열(한 줄씩 문단) */
  lines: string[]
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** 전송 중 — 두 버튼을 잠그고 라벨을 바꾼다(같은 전이가 두 번 나가지 않게) */
  busy?: boolean
}

/**
 * 어드민 확인 다이얼로그 (CHMO-811) — 되돌리기 어려운 결과를 낳는 전이(개통·종료·개통 취소)
 * 앞에 한 번 선다. 서비스 `ConfirmDialog`를 쓰지 않는 이유는 격리 규칙(§2-2)이 아니라
 * 그 컴포넌트가 폰 프레임(390 폭·바텀시트 관용) 안을 전제로 그려져서다 — 데스크탑 화면에서는
 * 자리도 크기도 맞지 않는다.
 *
 * ESC·스크림 탭은 취소(머무르기)로 받는다 — 실수로 닫혀도 잃는 것이 없는 쪽이 취소다.
 */
export function AdminConfirmDialog({
  title,
  lines,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: AdminConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-admin-border bg-admin-surface px-6 py-5 shadow-lg"
      >
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <div className="mt-2 space-y-1.5">
          {lines.map((line) => (
            <p key={line} className="text-[13px] leading-relaxed text-admin-muted">
              {line}
            </p>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 rounded-lg border border-admin-border bg-admin-surface px-4 text-[13px] text-admin-text hover:bg-admin-bg disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="h-9 rounded-lg border border-primary bg-primary px-4 text-[13px] font-semibold text-admin-text hover:brightness-95 disabled:opacity-60"
          >
            {busy ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
