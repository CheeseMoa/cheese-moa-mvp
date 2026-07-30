import { Button, Modal } from './ui'
import { GUARDIAN_CONSENT_COPY } from '../legal/consents'

interface GuardianConsentDialogProps {
  open: boolean
  /** 확인 기록 전송 중 — 두 버튼 비활성(중복 제출 방지) */
  busy?: boolean
  /** 기록 실패 메시지 — 모달을 닫지 않고 그 자리에서 다시 시도할 수 있게 */
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}

/**
 * 보호자 동의 확보 확인 모달 (CHMO-516) — 06-U 업로드가 `AGREEMENT428`을 받으면 뜬다.
 *
 * [동의를 받았어요] 탭 자체가 확인 행위다(체크박스를 한 겹 더 두지 않는다 — 확인 문장 하나에
 * 대한 확인이라 체크와 버튼을 나누면 같은 걸 두 번 시키는 꼴이다).
 * 문장은 03 모임 만들기 체크박스와 같은 원천을 쓴다(`src/legal/consents.ts`) — 서버에 남는
 * 기록은 하나이므로 화면마다 다른 문장을 보여줄 수 없다.
 * 경고 톤을 쓰지 않는다 — 대부분은 이미 동의를 받아 둔 선생님이고, 여긴 그 사실을 한 번
 * 확인받는 자리다.
 */
export function GuardianConsentDialog({
  open,
  busy = false,
  error,
  onConfirm,
  onClose,
}: GuardianConsentDialogProps) {
  return (
    <Modal
      open={open}
      title="보호자 동의를 받으셨나요?"
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <p className="mt-2 text-sm leading-relaxed text-text">{GUARDIAN_CONSENT_COPY.statement}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        모임마다 한 번만 확인해요. 확인하면 사진 업로드가 이어져요.
      </p>
      {error ? (
        <p role="alert" className="mt-2.5 text-sm text-warn">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2.5">
        <Button variant="secondary" className="flex-1" disabled={busy} onClick={onClose}>
          나중에
        </Button>
        <Button className="flex-1" disabled={busy} onClick={onConfirm}>
          {busy ? '확인 중…' : '동의를 받았어요'}
        </Button>
      </div>
    </Modal>
  )
}
