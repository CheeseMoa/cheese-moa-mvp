/**
 * 사용자 장수·기관 구독 기간 입력 규칙 단일 원천 (CHMO-931 — BE CHMO-912).
 *
 * 서버 검증은 `VALID400` 하나로 뭉뚱그려 온다(DTO @NotNull·@Size·@PositiveOrZero, 등록기의
 * `accessUntil > accessFrom`·기관 계정 확인, 장수 조정의 `delta != 0`). 그래서 같은 규칙을
 * 화면이 먼저 돌려 칸마다 말한다(팝업·혜택 푸시의 `promotion.ts`와 같은 결). 기준은 BE 소스
 * `AdminCreditAdjustmentRequest`·`AdminOrganizationSubscriptionPeriodRequest`·
 * `OrganizationSubscriptionPeriodRegistrar`·`CreditAccount.adjust`다. 목 핸들러도 이 파일을 쓴다.
 */
import type { AdminCreditAdjustmentInput, AdminSubscriptionPeriodInput } from '../api/types'

// ── 길이·크기 상한(BE DTO 그대로) ────────────────────────────────────

export const CREDIT_LIMITS = {
  /** `AdminCreditAdjustmentRequest.memo` @Size(max=500) — @NotBlank라 비면 안 된다 */
  memo: 500,
  /** 한 번에 조정할 수 있는 장수 — BE는 int 상한뿐이지만 운영에서 그 수를 넘길 일이 없다 */
  amount: 100_000,
} as const

export const PERIOD_LIMITS = {
  payerName: 100,
  invoiceNo: 100,
  memo: 500,
} as const

// ── KST 날짜 ─────────────────────────────────────────────────────────
//
// 운영자는 언제나 한국 날짜로 입력한다(해외에서 열어도 같은 값). `<input type="date">`의
// 값(`YYYY-MM-DD`)을 KST 자정으로 읽어 오프셋을 붙여 보낸다(한국은 서머타임이 없어 +09:00 고정).

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD` 형식인가 — 존재하지 않는 날짜(2월 30일)는 Date가 다음 달로 넘겨 버려 되돌려 확인한다 */
export function isKstDate(value: string): boolean {
  const match = DATE_RE.exec(value)
  if (!match) return false
  const [, y, m, d] = match
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  )
}

/** 그 날 KST 0시 — `2026-10-01` → `2026-10-01T00:00:00+09:00`. 형식이 아니면 null */
export function kstDateStartIso(date: string): string | null {
  return isKstDate(date) ? `${date}T00:00:00+09:00` : null
}

/**
 * 그 날을 **포함**하는 끝 — 다음 날 KST 0시. 운영자가 "11월 30일까지"라고 적으면 서버에는
 * 12월 1일 0시를 보낸다(BE `InstitutionAccessResolver`가 `now < accessUntil`로 판정하므로
 * 당일 밤 12시까지 쓸 수 있다). 형식이 아니면 null
 */
export function kstDateEndIso(date: string): string | null {
  const start = kstDateStartIso(date)
  if (!start) return null
  const next = new Date(new Date(start).getTime() + DAY_MS)
  return `${isoToKstDate(next.toISOString())}T00:00:00+09:00`
}

/** ISO 시각 → KST 날짜 `YYYY-MM-DD`. 파싱 불가면 빈 문자열 */
export function isoToKstDate(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  return new Date(time + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * 서버의 `accessUntil`(배타적 끝 시각) → 화면의 "마지막으로 쓸 수 있는 날". 등록 때 다음 날
 * 0시를 보냈으므로 1ms 전의 KST 날짜가 곧 그 날이다(`2026-12-01T00:00+09:00` → `2026-11-30`).
 * 다른 경로(curl 등)로 자정이 아닌 시각이 들어와도 "그 시각이 속한 날"로 읽혀 거짓이 되지 않는다.
 */
export function accessUntilToKstDate(iso: string | null): string | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return isoToKstDate(new Date(time - 1).toISOString())
}

/** 오늘(KST) `YYYY-MM-DD` — 입력칸 기본값 */
export function todayKstDate(now = new Date()): string {
  return isoToKstDate(now.toISOString())
}

/** 날짜로부터 n일 뒤(KST) — 종료일 기본값(한 달 뒤)용. 형식이 아니면 빈 문자열 */
export function kstDatePlusDays(date: string, days: number): string {
  const start = kstDateStartIso(date)
  if (!start) return ''
  return isoToKstDate(new Date(new Date(start).getTime() + days * DAY_MS).toISOString())
}

// ── 장수 조정 ────────────────────────────────────────────────────────

export type CreditAdjustMode = 'grant' | 'revoke'

export interface CreditAdjustDraft {
  mode: CreditAdjustMode
  /** 입력칸 원문 — 숫자로 못 읽으면 오류 */
  amount: string
  memo: string
}

export interface CreditAdjustErrors {
  amount: string | null
  memo: string | null
}

/**
 * 장수 조정 검증 — BE와 같은 규칙(delta ≠ 0 · 메모 필수 500자) + 회수는 잔액을 넘길 수 없다
 * (`CreditAccount.adjust`가 음수를 CREDIT409로 거절한다 — 보내기 전에 막는다).
 * 지급은 500장 상한을 넘길 수 있다(스펙 3.5 "어드민 장수 지급은 500 상한을 넘을 수 있다").
 */
export function validateCreditAdjust(
  draft: CreditAdjustDraft,
  balance: number,
): { errors: CreditAdjustErrors; input: AdminCreditAdjustmentInput | null } {
  const amount = Number(draft.amount.trim())
  const memo = draft.memo.trim()
  const errors: CreditAdjustErrors = {
    amount: !draft.amount.trim()
      ? '장수를 적어 주세요.'
      : !Number.isInteger(amount) || amount <= 0
        ? '1 이상의 정수로 적어 주세요.'
        : amount > CREDIT_LIMITS.amount
          ? `한 번에 ${CREDIT_LIMITS.amount.toLocaleString('ko-KR')}장까지만 조정할 수 있어요.`
          : draft.mode === 'revoke' && amount > balance
            ? `잔액(${balance.toLocaleString('ko-KR')}장)보다 많이 회수할 수 없어요.`
            : null,
    memo: !memo
      ? '무슨 일인지 메모를 남겨 주세요 · 장부에 그대로 남아요.'
      : memo.length > CREDIT_LIMITS.memo
        ? `${CREDIT_LIMITS.memo}자 이하로 줄여 주세요.`
        : null,
  }
  const valid = !errors.amount && !errors.memo
  return {
    errors,
    input: valid ? { delta: draft.mode === 'revoke' ? -amount : amount, memo } : null,
  }
}

// ── 기관 구독 기간 ───────────────────────────────────────────────────

export interface SubscriptionPeriodDraft {
  /** 이용 시작일(포함) `YYYY-MM-DD` */
  accessFromDate: string
  /** 이용 종료일(포함) `YYYY-MM-DD` */
  accessUntilDate: string
  /** 입금액(원) 원문 */
  amountKrw: string
  /** 입금일 `YYYY-MM-DD` */
  paidOn: string
  payerName: string
  invoiceNo: string
  memo: string
}

export type SubscriptionPeriodErrors = Record<keyof SubscriptionPeriodDraft, string | null>

/** 빈 초안 — 시작일·입금일은 오늘, 종료일은 30일 뒤(가장 흔한 월 정액) */
export function emptySubscriptionPeriodDraft(
  overrides: Partial<SubscriptionPeriodDraft> = {},
  now = new Date(),
): SubscriptionPeriodDraft {
  const today = todayKstDate(now)
  return {
    accessFromDate: today,
    accessUntilDate: kstDatePlusDays(today, 30),
    amountKrw: '',
    paidOn: today,
    payerName: '',
    invoiceNo: '',
    memo: '',
    ...overrides,
  }
}

/**
 * 기간 등록 검증 — BE DTO(@NotNull·@PositiveOrZero·@NotBlank·@Size)와 등록기
 * (`accessUntil.isAfter(accessFrom)`)를 합친 규칙. 날짜는 "종료일 포함"이라 같은 날도 허용된다
 * (서버엔 다음 날 0시가 가 `isAfter`를 만족한다).
 */
export function validateSubscriptionPeriod(draft: SubscriptionPeriodDraft): {
  errors: SubscriptionPeriodErrors
  input: AdminSubscriptionPeriodInput | null
} {
  const accessFrom = kstDateStartIso(draft.accessFromDate)
  const accessUntil = kstDateEndIso(draft.accessUntilDate)
  const amount = Number(draft.amountKrw.trim())
  const payerName = draft.payerName.trim()
  const invoiceNo = draft.invoiceNo.trim()
  const memo = draft.memo.trim()
  const errors: SubscriptionPeriodErrors = {
    accessFromDate: !accessFrom ? '이용 시작일을 골라 주세요.' : null,
    accessUntilDate: !accessUntil
      ? '이용 종료일을 골라 주세요.'
      : accessFrom && draft.accessUntilDate < draft.accessFromDate
        ? '종료일이 시작일보다 앞서요.'
        : null,
    amountKrw: !draft.amountKrw.trim()
      ? '입금액을 적어 주세요 · 무상이면 0.'
      : !Number.isInteger(amount) || amount < 0
        ? '0 이상의 정수(원)로 적어 주세요.'
        : null,
    paidOn: !isKstDate(draft.paidOn) ? '입금일을 골라 주세요.' : null,
    payerName: !payerName
      ? '입금자명을 적어 주세요.'
      : payerName.length > PERIOD_LIMITS.payerName
        ? `${PERIOD_LIMITS.payerName}자 이하로 줄여 주세요.`
        : null,
    invoiceNo:
      invoiceNo.length > PERIOD_LIMITS.invoiceNo
        ? `${PERIOD_LIMITS.invoiceNo}자 이하로 줄여 주세요.`
        : null,
    memo: memo.length > PERIOD_LIMITS.memo ? `${PERIOD_LIMITS.memo}자 이하로 줄여 주세요.` : null,
  }
  const valid = Object.values(errors).every((error) => error === null)
  return {
    errors,
    input:
      valid && accessFrom && accessUntil
        ? {
            accessFrom,
            accessUntil,
            amountKrw: amount,
            paidOn: draft.paidOn,
            payerName,
            invoiceNo: invoiceNo || null,
            memo: memo || null,
          }
        : null,
  }
}

/** 원화 표기 — `100,000원`. 0은 `0원`(무상 등록을 빈 칸으로 보이지 않게) */
export function formatKrw(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`
}
