import { Button } from './Button'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** 정책 문구(예: "이 앨범에서만 제거되고, 다른 앨범에서는 유지돼요.") */
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** 파괴적 액션(삭제 등) — 확인 버튼을 warn으로 */
  danger?: boolean
  /** 처리 중 — 두 버튼 비활성 + 확인 라벨 교체(중복 제출·진행 중 닫힘 방지) */
  busy?: boolean
  /** busy일 때 확인 버튼에 표시할 라벨(예: "삭제 중…") */
  busyLabel?: string
  onConfirm: () => void
  onClose: () => void
}

/** 확인 다이얼로그 (dc.html §09) — 파괴적 액션은 danger로 warn 버튼 + 정책 문구를 부제로 명시. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger,
  busy = false,
  busyLabel,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className="text-center">
        <h2 className="text-base font-bold text-text">{title}</h2>
        {description && <p className="mt-1.5 text-xs leading-normal text-muted">{description}</p>}
        <div className="mt-4 flex gap-2.5">
          <Button variant="secondary" className="flex-1" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'warn' : 'primary'}
            className="flex-1"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
