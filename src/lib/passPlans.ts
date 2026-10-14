/**
 * 기간 이용권 상품 표기 단일 원천 (CHMO-899).
 *
 * **공개 요금 안내(/pricing)는 로그인 없이 열려야 해서 서버 상품 API를 부를 수 없다**(모임 단위
 * 인증 API다). 그래서 공개 화면은 이 카탈로그를 쓰고, 로그인 뒤 결제 화면은 서버 응답
 * (GET plans · POST pass-orders)만 쓴다. 이 값은 BE `PassPlan` enum(1일 100 cent · 3일 150 ·
 * 7일 250 — CHMO-847 정책 결정)의 사본이라 **BE 가격을 바꾸면 여기도 함께** 바꾼다
 * (어긋나면 공개 표시가와 결제창 금액이 달라져 심사 탈락 사유다 — 계약 테스트가 픽스처와 대조한다).
 */
import type { PassMarket, PassPlanCode, PaymentCurrency } from '../types/api'

export interface PassCatalogItem {
  code: PassPlanCode
  /** 화면 상품명 — BE orderName("CheeseMoa 3일 이용권")과 같은 말 */
  name: string
  durationDays: number
  /** 이용 시간 — 승인 시점부터 정확히 24·72·168시간(BE가 Instant에 더한다) */
  hours: number
  usdAmount: number
}

export const PASS_CATALOG: readonly PassCatalogItem[] = [
  { code: 'DAY_1', name: '1일 이용권', durationDays: 1, hours: 24, usdAmount: 1.0 },
  { code: 'DAY_3', name: '3일 이용권', durationDays: 3, hours: 72, usdAmount: 1.5 },
  { code: 'DAY_7', name: '7일 이용권', durationDays: 7, hours: 168, usdAmount: 2.5 },
]

/** 상품 코드 → 화면 이름. 미지 코드(서버가 상품을 늘린 경우)는 일수로 지어 낸다 */
export function passPlanName(code: string, durationDays?: number): string {
  const item = PASS_CATALOG.find((plan) => plan.code === code)
  if (item) return item.name
  return durationDays ? `${durationDays}일 이용권` : '기간 이용권'
}

/** 일수 → 이용 시간 표기("72시간") — 서버 durationDays 기준 */
export function passHoursLabel(durationDays: number): string {
  return `${durationDays * 24}시간`
}

export const PASS_MARKET_LABEL: Record<PassMarket, string> = {
  domestic: '국내 결제 (원화 KRW)',
  international: '해외 결제 (미화 USD)',
}

/**
 * 금액 표기 — KRW는 `2,138원`, USD는 `US$1.50`(소수 둘째 자리 고정 — 1.5를 1.5로 쓰면 가격표처럼
 * 안 읽힌다). 값은 바꾸지 않고 **표기만** 한다(결제창에 넘기는 값은 주문 응답 원본).
 */
export function formatMoney(amount: number, currency: PaymentCurrency | string): string {
  if (currency === 'KRW') return `${Math.round(amount).toLocaleString('ko-KR')}원`
  if (currency === 'USD') return `US$${amount.toFixed(2)}`
  return `${amount} ${currency}`
}

export function formatUsd(amount: number): string {
  return formatMoney(amount, 'USD')
}

/** 기준환율 표기 — 1425.31 → `1,425.31원` */
export function formatRate(rate: number): string {
  return `${rate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원`
}

/**
 * 시각 표기 — 사용자 로컬 시간대(서버는 UTC Instant). `2026. 10. 5. 오후 4:03`.
 * 이용 시작·종료처럼 분 단위가 의미 있는 값이라 초는 뺀다.
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Idempotency-Key — UUID v4 36자(BE 검증). `crypto.randomUUID`는 보안 컨텍스트(https·localhost)
 * 전용이고 iOS 15.4 미만엔 없어서, 없으면 getRandomValues로 같은 형식을 만든다.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
