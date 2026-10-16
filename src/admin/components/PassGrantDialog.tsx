import { useMemo, useState } from 'react'
import { ApiRequestError } from '../../api/client'
import { useMutation } from '../../hooks/useMutation'
import { grantAdminGroupPass } from '../api/admin'
import type { AdminPassGrantResult, AdminPassPlan } from '../api/types'
import {
  CREDIT_LIMITS,
  PASS_PLAN_OPTIONS,
  passAccessUntilAfterGrant,
  validatePassGrant,
} from '../lib/billing'
import { formatDateTime, groupLabel } from '../lib/format'
import { randomUuid } from '../lib/uuid'
import { textareaClassName } from '../lib/formStyles'
import { AdminDialog, AdminDialogActions } from './AdminDialog'
import { AdminNotice, ChoiceGroup, Field } from './AdminForm'

/**
 * 모임 패스 지급 다이얼로그 (CHMO-932 — BE A-8). 모임 상세의 패스 구획에서 연다 — 개인 범위 모임에만
 * 선다(기관 범위는 이용 기간이 업로드를 결정하므로 서버도 VALID400으로 거절한다).
 *
 * 플랜은 세그먼트(1·3·7·30일)라 틀릴 수 없고 메모만 필수다 — 지급 원장에 그대로 남아 "왜 줬나"를 그
 * 줄이 말한다(설문 보상·체험·오지급 보정). "반영 뒤 ~까지"를 미리 보여 주는 건 **누적 규칙** 때문이다:
 * 살아 있는 패스가 있으면 지금부터가 아니라 그 만료 뒤에 이어 붙어, 운영자가 "7일을 줬는데 왜 20일
 * 뒤까지인가"를 묻지 않게 한다.
 *
 * `Idempotency-Key`는 다이얼로그를 열 때 한 번 만들어 재시도에만 재사용한다(ADR 045).
 */
export function PassGrantDialog({
  groupId,
  currentAccessUntil,
  onClose,
  onDone,
}: {
  groupId: number
  /** 지금 살아 있는 패스의 만료 — 없으면 null(지급분이 지금부터 시작한다) */
  currentAccessUntil: string | null
  onClose: () => void
  onDone: (result: AdminPassGrantResult) => void
}) {
  const [plan, setPlan] = useState<AdminPassPlan>('DAY_7')
  const [memo, setMemo] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [idempotencyKey] = useState(randomUuid)
  const mutate = useMutation()

  const { errors, input } = useMemo(() => validatePassGrant({ plan, memo }), [plan, memo])
  const show = (message: string | null) => (touched ? message : null)
  const until = useMemo(() => passAccessUntilAfterGrant(currentAccessUntil, plan), [currentAccessUntil, plan])

  const submit = async () => {
    setTouched(true)
    if (!input) return
    setBusy(true)
    setServerError(null)
    await mutate(() => grantAdminGroupPass(groupId, input, idempotencyKey), {
      noAuthRedirect: true,
      onSuccess: (result) => {
        setBusy(false)
        onDone(result)
      },
      onError: (message, err) => {
        setBusy(false)
        if (err instanceof ApiRequestError && err.status === 404) {
          setServerError('모임을 찾을 수 없어요 · 그 사이 지워졌을 수 있어요.')
          return
        }
        if (err instanceof ApiRequestError && err.code === 'ADMIN_REQUEST_CONFLICT') {
          setServerError('같은 요청 키로 다른 내용이 이미 처리됐어요 · 창을 닫고 다시 열어 주세요.')
          return
        }
        // VALID400(기관 범위 모임)은 BE 메시지가 그대로 설명이다 — "기관 범위 모임은 이용 기간으로 등록합니다."
        setServerError(message)
      },
    })
  }

  return (
    <AdminDialog
      title={`${groupLabel(groupId)} 패스 지급`}
      description="개인 범위 모임의 업로드를 기간으로 열어요 · 패스가 살아 있는 동안은 멤버 누구의 장수도 줄지 않아요."
      onClose={onClose}
      busy={busy}
      widthClassName="max-w-md"
      footer={
        <AdminDialogActions
          confirmLabel="지급하기"
          busyLabel="반영 중…"
          onCancel={onClose}
          onConfirm={() => void submit()}
          busy={busy}
          confirmDisabled={touched && !input}
        />
      }
    >
      <div className="space-y-4">
        <Field label="기간" hint={`반영 뒤 ${formatDateTime(until)}까지 · 살아 있는 패스가 있으면 그 만료 뒤에 이어 붙어요`}>
          <ChoiceGroup<AdminPassPlan>
            label="패스 기간"
            value={plan}
            onChange={setPlan}
            disabled={busy}
            choices={PASS_PLAN_OPTIONS}
          />
        </Field>

        <Field
          label="메모"
          htmlFor="pass-grant-memo"
          hint="지급 이력에 그대로 남아요 · 예) 설문 참여 보상 · 분류 오류 보상"
          count={{ value: memo.length, max: CREDIT_LIMITS.memo }}
          error={show(errors.memo)}
        >
          <textarea
            id="pass-grant-memo"
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={() => setTouched(true)}
            disabled={busy}
            className={textareaClassName(Boolean(show(errors.memo)))}
          />
        </Field>

        <AdminNotice
          lines={[
            '회수하면 그 지급분만큼 만료가 당겨지고, 이미 지난 시각으로는 줄지 않아요.',
            '스토어에서 산 이용권은 여기 이력에 안 보여요 · 만료 시각에는 함께 반영돼요.',
          ]}
        />

        {serverError ? (
          <p className="text-xs text-warn" role="alert">
            {serverError}
          </p>
        ) : null}
      </div>
    </AdminDialog>
  )
}
