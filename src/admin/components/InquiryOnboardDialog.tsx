import { useState } from 'react'
import type { AdminInquiry, AdminSubscriptionPeriodInput } from '../api/types'
import { useSubscriptionPeriodForm } from '../hooks/useSubscriptionPeriodForm'
import { AdminDialog, AdminDialogActions } from './AdminDialog'
import { AdminNotice } from './AdminForm'
import { SubscriptionPeriodFields } from './SubscriptionPeriodFields'

/** 개통 뒤 사용자 쪽 동작(앱 CHMO-809 승인 대기 화면 규칙) — 운영자가 전화로 알려 줄 말이다 */
export const AFTER_ONBOARD_NOTE = '사용자는 앱의 [다시 확인]을 누르거나 앱을 다시 열면 시작할 수 있어요.'

/**
 * 기관 문의 개통 다이얼로그 (CHMO-931 — CHMO-811 개통 확인을 넓힌 것).
 *
 * 개통(ONBOARDED)과 첫 이용 기간 등록을 **한 흐름**으로 둔다. BE는 둘을 한 트랜잭션으로 받는다
 * (`PATCH …/{id}` `subscriptionPeriod`). 기간 없이 개통하는 길도 남긴다(입금이 아직일 때) — 다만 그
 * 결과를 말한다. **기관 계정은 가입 때 체험 14일이 자동으로 들어간다**(BE CHMO-940, 2026-10-16 운영
 * 반영 — CHMO-932에서 문구 정정): 그래서 기간 없이 개통해도 체험이 남아 있는 동안은 안 막히고, 체험이
 * 끝나면 7일 유예 뒤 차단된다(BE `InstitutionAccessResolver`). 체험 기간은 사용자 상세의 이력에 '가입
 * 체험'으로 보인다.
 */
export function InquiryOnboardDialog({
  inquiry,
  busy,
  onCancel,
  onConfirm,
}: {
  inquiry: AdminInquiry
  busy: boolean
  onCancel: () => void
  onConfirm: (period: AdminSubscriptionPeriodInput | null) => void
}) {
  const [withPeriod, setWithPeriod] = useState(true)
  // 입금자명은 기관명으로 미리 채운다 — 통장에는 대개 기관명이 찍힌다
  const form = useSubscriptionPeriodForm({ payerName: inquiry.organizationName })

  const confirm = () => {
    if (!withPeriod) {
      onConfirm(null)
      return
    }
    form.markTouched()
    if (!form.input) return
    onConfirm(form.input)
  }

  return (
    <AdminDialog
      title={`'${inquiry.organizationName}' 계정을 개통할까요?`}
      description="개통하면 이 사용자가 앱에서 모임을 만들고 사진을 올릴 수 있어요."
      onClose={onCancel}
      busy={busy}
      footer={
        <AdminDialogActions
          confirmLabel={withPeriod ? '기간 등록하고 개통' : '기간 없이 개통'}
          busyLabel="개통 중…"
          onCancel={onCancel}
          onConfirm={confirm}
          busy={busy}
          confirmDisabled={withPeriod && form.touched && !form.input}
        />
      }
    >
      <div className="space-y-4">
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={withPeriod}
            onChange={(e) => setWithPeriod(e.target.checked)}
            disabled={busy}
            className="h-4 w-4 accent-primary"
          />
          <span className="font-semibold">첫 이용 기간을 함께 등록해요</span>
          <span className="text-admin-muted">(입금 확인된 경우)</span>
        </label>

        {withPeriod ? (
          <SubscriptionPeriodFields form={form} disabled={busy} idPrefix={`onboard-${inquiry.id}`} />
        ) : (
          <AdminNotice
            lines={[
              '기관 계정은 가입할 때 체험 14일이 자동으로 들어가요 · 체험이 남아 있으면 개통 직후에도 올릴 수 있어요.',
              '체험이 끝나면 7일 유예 뒤 차단돼요 · 입금이 확인되면 사용자 상세나 기관 구독 화면에서 기간을 등록해 주세요.',
            ]}
          />
        )}

        <p className="text-xs text-admin-muted">{AFTER_ONBOARD_NOTE}</p>
      </div>
    </AdminDialog>
  )
}
