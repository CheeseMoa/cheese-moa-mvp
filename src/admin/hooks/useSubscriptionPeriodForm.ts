import { useMemo, useState } from 'react'
import type { AdminSubscriptionPeriodInput } from '../api/types'
import {
  emptySubscriptionPeriodDraft,
  validateSubscriptionPeriod,
  type SubscriptionPeriodDraft,
  type SubscriptionPeriodErrors,
} from '../lib/billing'

export interface SubscriptionPeriodForm {
  draft: SubscriptionPeriodDraft
  update: <K extends keyof SubscriptionPeriodDraft>(field: K, value: SubscriptionPeriodDraft[K]) => void
  errors: SubscriptionPeriodErrors
  /** 검증을 통과했을 때만 값 — 아니면 null */
  input: AdminSubscriptionPeriodInput | null
  /** 오류를 보이기 시작했나(저장을 한 번 눌렀거나 칸을 떠났다) */
  touched: boolean
  markTouched: () => void
}

/**
 * 기관 구독 기간 폼 상태 (CHMO-931) — 기간 등록 다이얼로그와 기관 문의 개통 다이얼로그가 같은
 * 칸·같은 검증을 쓴다(규칙은 `lib/billing.ts`, 칸은 `components/SubscriptionPeriodFields`). 오류는
 * 저장을 눌렀거나 칸을 떠난 뒤에만 보인다(열자마자 붉은 줄이 서면 아직 안 적은 칸이 틀린 것처럼
 * 읽힌다). 컴포넌트 파일과 떨어져 있는 건 Fast Refresh 때문이다(formStyles와 같은 이유).
 */
export function useSubscriptionPeriodForm(
  initial: Partial<SubscriptionPeriodDraft> = {},
): SubscriptionPeriodForm {
  const [draft, setDraft] = useState<SubscriptionPeriodDraft>(() =>
    emptySubscriptionPeriodDraft(initial),
  )
  const [touched, setTouched] = useState(false)
  const { errors, input } = useMemo(() => validateSubscriptionPeriod(draft), [draft])
  return {
    draft,
    update: (field, value) => setDraft((prev) => ({ ...prev, [field]: value })),
    errors,
    input,
    touched,
    markTouched: () => setTouched(true),
  }
}
