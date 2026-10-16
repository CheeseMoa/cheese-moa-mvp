import { useMemo, useState } from 'react'
import { ApiRequestError } from '../../api/client'
import { useMutation } from '../../hooks/useMutation'
import { adjustAdminUserCredits } from '../api/admin'
import type { AdminCreditAdjustment } from '../api/types'
import { CREDIT_LIMITS, validateCreditAdjust, type CreditAdjustMode } from '../lib/billing'
import { formatCount } from '../lib/format'
import { inputClassName, textareaClassName } from '../lib/formStyles'
import { randomUuid } from '../lib/uuid'
import { AdminDialog, AdminDialogActions } from './AdminDialog'
import { ChoiceGroup, Field } from './AdminForm'

/**
 * 장수 지급·회수 다이얼로그 (CHMO-931) — 사용자 상세의 장수 카드에서 연다.
 * 한 다이얼로그에 지급/회수 세그먼트를 둔 이유: 둘이 같은 API(`delta` 부호만 다르다)이고
 * 운영자가 "오지급을 되돌린다"처럼 연달아 쓴다. 메모는 필수 — 장부에 그대로 남아 나중에 왜
 * 조정했는지를 그 줄이 말한다.
 *
 * 회수가 잔액을 넘는 건 화면 검증이 먼저 막지만, 다른 관리자와 겹치면 서버 CREDIT409가 올 수 있어
 * 그때는 장수 칸 아래에서 다시 말하고 호출부가 잔액을 다시 읽는다.
 *
 * `Idempotency-Key`(CHMO-932)는 다이얼로그를 열 때 한 번 만들어 **재시도에만** 재사용한다 — 네트워크가
 * 끊겨 응답을 못 받고 다시 눌러도 서버가 두 번 지급하지 않는다(ADR 045). 지급·회수를 오가며 내용을
 * 바꾸는 건 첫 전송 전이라 같은 키라도 충돌이 없다(서버는 처리된 키만 기억한다).
 */
export function CreditAdjustDialog({
  userId,
  nickname,
  balance,
  initialMode = 'grant',
  onClose,
  onDone,
}: {
  userId: number
  nickname: string | null
  balance: number
  initialMode?: CreditAdjustMode
  onClose: () => void
  onDone: (result: AdminCreditAdjustment) => void
}) {
  const [mode, setMode] = useState<CreditAdjustMode>(initialMode)
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<{ field: 'amount' | 'form'; message: string } | null>(null)
  const [idempotencyKey] = useState(randomUuid)
  const mutate = useMutation()

  const { errors, input } = useMemo(
    () => validateCreditAdjust({ mode, amount, memo }, balance),
    [mode, amount, memo, balance],
  )
  const show = (message: string | null) => (touched ? message : null)
  const amountError = show(errors.amount) ?? (serverError?.field === 'amount' ? serverError.message : null)

  const submit = async () => {
    setTouched(true)
    if (!input) return
    setBusy(true)
    setServerError(null)
    await mutate(() => adjustAdminUserCredits(userId, input, idempotencyKey), {
      noAuthRedirect: true,
      onSuccess: (result) => {
        setBusy(false)
        onDone(result)
      },
      onError: (message, err) => {
        setBusy(false)
        const code = err instanceof ApiRequestError ? err.code : ''
        if (code === 'CREDIT_INSUFFICIENT') {
          setServerError({ field: 'amount', message: '잔액보다 많이 회수할 수 없어요 · 잔액이 그 사이 바뀌었어요.' })
          return
        }
        if (code === 'BILLING_UNAVAILABLE') {
          setServerError({ field: 'form', message: '장수 기능이 서버에서 아직 켜지지 않았어요.' })
          return
        }
        if (code === 'ADMIN_REQUEST_CONFLICT') {
          setServerError({ field: 'form', message: '같은 요청 키로 다른 내용이 이미 처리됐어요 · 창을 닫고 다시 열어 주세요.' })
          return
        }
        setServerError({ field: 'form', message })
      },
    })
  }

  const after = input ? balance + input.delta : null

  return (
    <AdminDialog
      title={`${nickname ?? `#${userId}`} 장수 조정`}
      description={`지금 잔액 ${formatCount(balance)}장 · 지급은 500장 상한을 넘겨도 돼요`}
      onClose={onClose}
      busy={busy}
      widthClassName="max-w-md"
      footer={
        <AdminDialogActions
          confirmLabel={mode === 'grant' ? '지급하기' : '회수하기'}
          busyLabel="반영 중…"
          onCancel={onClose}
          onConfirm={() => void submit()}
          busy={busy}
          confirmDisabled={touched && !input}
          confirmTone={mode === 'revoke' ? 'warn' : 'primary'}
        />
      }
    >
      <div className="space-y-4">
        <ChoiceGroup<CreditAdjustMode>
          label="조정 종류"
          value={mode}
          onChange={(next) => {
            setMode(next)
            setServerError(null)
          }}
          disabled={busy}
          choices={[
            { value: 'grant', label: '지급' },
            { value: 'revoke', label: '회수' },
          ]}
        />

        <Field
          label="장수"
          htmlFor="credit-amount"
          hint={after !== null ? `반영 뒤 잔액 ${formatCount(after)}장` : undefined}
          error={amountError}
        >
          <input
            id="credit-amount"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setServerError(null)
            }}
            onBlur={() => setTouched(true)}
            disabled={busy}
            placeholder="100"
            className={inputClassName(Boolean(amountError))}
          />
        </Field>

        <Field
          label="메모"
          htmlFor="credit-memo"
          hint="장부에 그대로 남아요 · 예) 분류 오류 보상 · 체험 지급"
          count={{ value: memo.length, max: CREDIT_LIMITS.memo }}
          error={show(errors.memo)}
        >
          <textarea
            id="credit-memo"
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={() => setTouched(true)}
            disabled={busy}
            className={textareaClassName(Boolean(show(errors.memo)))}
          />
        </Field>

        {serverError?.field === 'form' ? (
          <p className="text-xs text-warn" role="alert">
            {serverError.message}
          </p>
        ) : null}
      </div>
    </AdminDialog>
  )
}
