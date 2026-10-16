import { useState } from 'react'
import { ApiRequestError } from '../../api/client'
import { useMutation } from '../../hooks/useMutation'
import { registerAdminSubscriptionPeriod } from '../api/admin'
import type { AdminOrganizationSubscription } from '../api/types'
import { useSubscriptionPeriodForm } from '../hooks/useSubscriptionPeriodForm'
import { randomUuid } from '../lib/uuid'
import { AdminDialog, AdminDialogActions } from './AdminDialog'
import { SubscriptionPeriodFields } from './SubscriptionPeriodFields'

/**
 * 기관 이용 기간 등록 다이얼로그 (CHMO-931) — 사용자 상세·기관 구독 목록에서 연다.
 * 등록은 **기간을 더하는 것**이다(겹쳐도 되고, 접근 상태는 무효화되지 않은 기간 중 가장 늦은
 * 종료로 계산된다 — BE `InstitutionAccessResolver`). 그래서 "연장"도 새 기간 등록이다.
 *
 * 서버가 거절하는 VALID400(기관 계정 아님·종료≤시작)은 폼 아래 한 줄로 받는다 — 두 번째는
 * 화면 검증이 먼저 막으므로 실제로 오는 건 "기관 계정이 아닙니다"뿐이다.
 * `Idempotency-Key`(CHMO-932)는 열 때 한 번 만들어 재시도에만 재사용한다 — 응답을 못 받고 다시 눌러도
 * 같은 기간이 두 줄 등록되지 않는다(ADR 045).
 */
export function SubscriptionPeriodDialog({
  userId,
  nickname,
  defaultPayerName,
  onClose,
  onRegistered,
}: {
  userId: number
  nickname: string | null
  /** 입금자명 기본값 — 기관 문의가 있으면 기관명, 없으면 닉네임 */
  defaultPayerName?: string
  onClose: () => void
  onRegistered: (result: AdminOrganizationSubscription) => void
}) {
  const form = useSubscriptionPeriodForm({ payerName: defaultPayerName ?? nickname ?? '' })
  const mutate = useMutation()
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [idempotencyKey] = useState(randomUuid)

  const submit = async () => {
    form.markTouched()
    if (!form.input) return
    setBusy(true)
    setServerError(null)
    await mutate(() => registerAdminSubscriptionPeriod(userId, form.input!, idempotencyKey), {
      noAuthRedirect: true,
      onSuccess: (result) => {
        setBusy(false)
        onRegistered(result)
      },
      onError: (message, err) => {
        setBusy(false)
        if (err instanceof ApiRequestError && err.status === 404) {
          setServerError('사용자를 찾을 수 없어요 · 계정이 지워졌을 수 있어요.')
          return
        }
        if (err instanceof ApiRequestError && err.code === 'ADMIN_REQUEST_CONFLICT') {
          setServerError('같은 요청 키로 다른 내용이 이미 처리됐어요 · 창을 닫고 다시 열어 주세요.')
          return
        }
        setServerError(message)
      },
    })
  }

  return (
    <AdminDialog
      title={`${nickname ?? `#${userId}`} 이용 기간 등록`}
      description="입금 확인 뒤 기간을 더해요 · 이미 있는 기간과 겹쳐도 가장 늦은 종료일까지 쓸 수 있어요."
      onClose={onClose}
      busy={busy}
      footer={
        <AdminDialogActions
          confirmLabel="기간 등록"
          busyLabel="등록 중…"
          onCancel={onClose}
          onConfirm={() => void submit()}
          busy={busy}
          confirmDisabled={form.touched && !form.input}
        />
      }
    >
      <SubscriptionPeriodFields form={form} disabled={busy} idPrefix={`period-${userId}`} />
      {serverError ? (
        <p className="mt-3 text-xs text-warn" role="alert">
          {serverError}
        </p>
      ) : null}
    </AdminDialog>
  )
}
