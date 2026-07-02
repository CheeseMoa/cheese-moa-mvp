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
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="text-center">
        <h2 className="text-base font-bold text-text">{title}</h2>
        {description && <p className="mt-1.5 text-xs leading-normal text-muted">{description}</p>}
        <div className="mt-4 flex gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'warn' : 'primary'} className="flex-1" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
