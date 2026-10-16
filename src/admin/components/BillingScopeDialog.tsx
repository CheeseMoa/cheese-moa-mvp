import { useMemo, useState } from 'react'
import { ApiRequestError } from '../../api/client'
import { useMutation } from '../../hooks/useMutation'
import { changeAdminGroupBillingScope } from '../api/admin'
import type { AdminBillingScope, AdminBillingScopeResult } from '../api/types'
import { CREDIT_LIMITS, validateBillingScope } from '../lib/billing'
import { groupLabel } from '../lib/format'
import { inputClassName, textareaClassName } from '../lib/formStyles'
import { AdminDialog, AdminDialogActions } from './AdminDialog'
import { AdminNotice, ChoiceGroup, Field } from './AdminForm'

/**
 * 모임 과금 범위 변경 다이얼로그 (CHMO-932 — BE CHMO-912 `PUT /admin/groups/{id}/billing-scope`).
 * 상세가 현재 값(범위·소유자)을 주게 되면서 처음 만들 수 있게 됐다 — 현재 값을 모른 채 바꾸는 폼은
 * "무엇에서 무엇으로"를 말할 수 없어 사고가 된다.
 *
 * 소유자는 userId로 적는다(사용자 화면의 `#번호`) — 닉네임은 소셜 가입이라 여럿이 같을 수 있어 식별자가
 * 못 된다. 기관 범위의 소유자는 기관 계정이어야 한다는 규칙은 **서버만 안다**(계정 유형을 여기서 조회하지
 * 않는다) — VALID400이 오면 소유자 칸 아래에서 말한다. 소유권 이전(모임 생성자 변경)은 이 값을 바꾸지
 * 않는다(ADR 039 스냅샷) — 바꾸려면 여기서 명시적으로.
 */
export function BillingScopeDialog({
  groupId,
  current,
  onClose,
  onDone,
}: {
  groupId: number
  current: { billingScope: AdminBillingScope; billingOwnerUserId: number | null }
  onClose: () => void
  onDone: (result: AdminBillingScopeResult) => void
}) {
  const [billingScope, setBillingScope] = useState<AdminBillingScope>(current.billingScope)
  const [owner, setOwner] = useState(current.billingOwnerUserId === null ? '' : String(current.billingOwnerUserId))
  const [memo, setMemo] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<{ field: 'owner' | 'form'; message: string } | null>(null)
  const mutate = useMutation()

  const { errors, input } = useMemo(
    () => validateBillingScope({ billingScope, billingOwnerUserId: owner, memo }),
    [billingScope, owner, memo],
  )
  const show = (message: string | null) => (touched ? message : null)
  const ownerError =
    show(errors.billingOwnerUserId) ?? (serverError?.field === 'owner' ? serverError.message : null)
  const unchanged =
    input !== null &&
    input.billingScope === current.billingScope &&
    input.billingOwnerUserId === current.billingOwnerUserId

  const submit = async () => {
    setTouched(true)
    if (!input || unchanged) return
    setBusy(true)
    setServerError(null)
    await mutate(() => changeAdminGroupBillingScope(groupId, input), {
      noAuthRedirect: true,
      onSuccess: (result) => {
        setBusy(false)
        onDone(result)
      },
      onError: (message, err) => {
        setBusy(false)
        const status = err instanceof ApiRequestError ? err.status : 0
        // USER404 = 소유자 userId가 없다 · VALID400 = 기관 범위인데 기관 계정이 아니다 — 둘 다 소유자 칸의 일
        if (status === 404 || status === 400) {
          setServerError({
            field: 'owner',
            message: status === 404 ? '그 사용자 ID가 없어요 · 사용자 화면의 #번호를 확인해 주세요.' : message,
          })
          return
        }
        setServerError({ field: 'form', message })
      },
    })
  }

  return (
    <AdminDialog
      title={`${groupLabel(groupId)} 과금 범위 변경`}
      description="이 모임의 업로드를 무엇으로 판정할지 바꿔요 · 바꾼 기록은 감사 이력에 남아요."
      onClose={onClose}
      busy={busy}
      widthClassName="max-w-md"
      footer={
        <AdminDialogActions
          confirmLabel="변경하기"
          busyLabel="반영 중…"
          onCancel={onClose}
          onConfirm={() => void submit()}
          busy={busy}
          confirmDisabled={(touched && !input) || unchanged}
        />
      }
    >
      <div className="space-y-4">
        <Field
          label="과금 범위"
          hint={
            billingScope === 'PERSONAL'
              ? '모임 패스가 살아 있으면 패스, 없으면 올리는 사람의 장수가 줄어요.'
              : '과금 소유 기관의 이용 기간으로 올려요 · 기간이 없으면 첫날부터 막혀요.'
          }
        >
          <ChoiceGroup<AdminBillingScope>
            label="과금 범위"
            value={billingScope}
            onChange={(next) => {
              setBillingScope(next)
              setServerError(null)
            }}
            disabled={busy}
            choices={[
              { value: 'PERSONAL', label: '개인 (장수·패스)' },
              { value: 'INSTITUTION', label: '기관 (이용 기간)' },
            ]}
          />
        </Field>

        <Field
          label="과금 소유자 사용자 ID"
          htmlFor="billing-owner"
          hint={
            billingScope === 'INSTITUTION'
              ? '기관 계정이어야 해요 · 그 기관의 이용 기간이 이 모임에 적용돼요.'
              : '개인 범위에선 패스 구매 주체 기록용이에요 · 장수는 실제 올리는 사람 것이 줄어요.'
          }
          error={ownerError}
        >
          <input
            id="billing-owner"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value)
              setServerError(null)
            }}
            onBlur={() => setTouched(true)}
            disabled={busy}
            placeholder="예) 52"
            className={inputClassName(Boolean(ownerError))}
          />
        </Field>

        <Field
          label="메모"
          htmlFor="billing-memo"
          hint="감사 이력에 그대로 남아요 · 예) 유치원 계약 전환 · 생성자 계정 착오"
          count={{ value: memo.length, max: CREDIT_LIMITS.memo }}
          error={show(errors.memo)}
        >
          <textarea
            id="billing-memo"
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={() => setTouched(true)}
            disabled={busy}
            className={textareaClassName(Boolean(show(errors.memo)))}
          />
        </Field>

        {unchanged && touched ? (
          <AdminNotice lines={['지금 값과 같아요 · 범위나 소유자를 바꿔야 저장돼요.']} />
        ) : null}

        {serverError?.field === 'form' ? (
          <p className="text-xs text-warn" role="alert">
            {serverError.message}
          </p>
        ) : null}
      </div>
    </AdminDialog>
  )
}
