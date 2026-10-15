import type { SubscriptionPeriodForm } from '../hooks/useSubscriptionPeriodForm'
import { PERIOD_LIMITS } from '../lib/billing'
import { inputClassName, textareaClassName } from '../lib/formStyles'
import { Field } from './AdminForm'

/**
 * 기간 입력칸(CHMO-931 — 상태는 `hooks/useSubscriptionPeriodForm`) — 시작·종료(KST 날짜, 종료일 포함) · 입금액 · 입금일 · 입금자명 · 세금계산서 번호 ·
 * 메모. 날짜는 `type="date"`라 브라우저 달력으로 고르고 값은 `YYYY-MM-DD`로 온다.
 */
export function SubscriptionPeriodFields({
  form,
  disabled,
  idPrefix = 'period',
}: {
  form: SubscriptionPeriodForm
  disabled?: boolean
  /** 같은 화면에 폼이 둘일 때 label·input id 충돌 방지 */
  idPrefix?: string
}) {
  const { draft, update, errors, touched, markTouched } = form
  const show = (message: string | null) => (touched ? message : null)
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="이용 시작일" htmlFor={id('from')} error={show(errors.accessFromDate)}>
          <input
            id={id('from')}
            type="date"
            value={draft.accessFromDate}
            onChange={(e) => update('accessFromDate', e.target.value)}
            onBlur={markTouched}
            disabled={disabled}
            className={inputClassName(Boolean(show(errors.accessFromDate)))}
          />
        </Field>
        <Field
          label="이용 종료일"
          htmlFor={id('until')}
          hint="그 날 밤 12시까지 올릴 수 있어요 · 끝나면 7일 유예 뒤 업로드가 막혀요"
          error={show(errors.accessUntilDate)}
        >
          <input
            id={id('until')}
            type="date"
            value={draft.accessUntilDate}
            min={draft.accessFromDate || undefined}
            onChange={(e) => update('accessUntilDate', e.target.value)}
            onBlur={markTouched}
            disabled={disabled}
            className={inputClassName(Boolean(show(errors.accessUntilDate)))}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="입금액(원)" htmlFor={id('amount')} hint="무상 제공이면 0" error={show(errors.amountKrw)}>
          <input
            id={id('amount')}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={draft.amountKrw}
            onChange={(e) => update('amountKrw', e.target.value)}
            onBlur={markTouched}
            disabled={disabled}
            placeholder="100000"
            className={inputClassName(Boolean(show(errors.amountKrw)))}
          />
        </Field>
        <Field label="입금일" htmlFor={id('paid')} error={show(errors.paidOn)}>
          <input
            id={id('paid')}
            type="date"
            value={draft.paidOn}
            onChange={(e) => update('paidOn', e.target.value)}
            onBlur={markTouched}
            disabled={disabled}
            className={inputClassName(Boolean(show(errors.paidOn)))}
          />
        </Field>
      </div>

      <Field
        label="입금자명"
        htmlFor={id('payer')}
        count={{ value: draft.payerName.length, max: PERIOD_LIMITS.payerName }}
        error={show(errors.payerName)}
      >
        <input
          id={id('payer')}
          type="text"
          value={draft.payerName}
          onChange={(e) => update('payerName', e.target.value)}
          onBlur={markTouched}
          disabled={disabled}
          placeholder="통장에 찍힌 이름"
          className={inputClassName(Boolean(show(errors.payerName)))}
        />
      </Field>

      <Field
        label="세금계산서 번호"
        htmlFor={id('invoice')}
        optional
        count={{ value: draft.invoiceNo.length, max: PERIOD_LIMITS.invoiceNo }}
        error={show(errors.invoiceNo)}
      >
        <input
          id={id('invoice')}
          type="text"
          value={draft.invoiceNo}
          onChange={(e) => update('invoiceNo', e.target.value)}
          onBlur={markTouched}
          disabled={disabled}
          className={inputClassName(Boolean(show(errors.invoiceNo)))}
        />
      </Field>

      <Field
        label="메모"
        htmlFor={id('memo')}
        optional
        count={{ value: draft.memo.length, max: PERIOD_LIMITS.memo }}
        error={show(errors.memo)}
      >
        <textarea
          id={id('memo')}
          rows={2}
          value={draft.memo}
          onChange={(e) => update('memo', e.target.value)}
          onBlur={markTouched}
          disabled={disabled}
          placeholder="예) 10월 이용료 · 담당자 통화 내용"
          className={textareaClassName(Boolean(show(errors.memo)))}
        />
      </Field>
    </div>
  )
}
