/**
 * 기간 이용권 결제 엔드포인트 (BE CHMO-847 — 웹 결제 CHMO-899).
 *
 * 계약 기준은 BE 리포 `docs/spec/CHMO-847-BUSINESS-모임-월-구독-결제.md` §3.
 * 전부 비즈니스 모임의 ACTIVE 관리자(editor) 전용이다(멤버 ROLE403 · 비멤버·승인 대기 SPACE403 ·
 * 일반 모임 BILLING400).
 *
 * **월 구독(billing/setup·payment-method·subscription)은 여기 없다** — 웹이 파는 상품은 자동
 * 갱신 없는 1·3·7일 단건 이용권뿐이다(토스 심사 범위 CHMO-899). 구독 상태 조회·해지는
 * 앱(CHMO-898)이 갖고 있다.
 *
 * 금액은 FE가 계산하지 않는다: 주문 준비가 금액·통화·환율·만료를 서버에 고정하고, 화면은
 * 그 응답을 그대로 결제창에 넘기며, 승인도 서버가 고정한 금액으로만 한다.
 */
import { apiFetch } from './client'
import {
  toCurrentPass,
  toPassConfirmation,
  toPassOrder,
  toPassPlan,
  type RawCurrentPass,
  type RawPassConfirmation,
  type RawPassOrder,
  type RawPassPlan,
} from './mappers'
import type {
  CurrentPass,
  ID,
  PassConfirmation,
  PassMarket,
  PassOrder,
  PassPlan,
  PassPlanCode,
} from '../types/api'

/** GET /groups/:id/passes/plans — 상품 3종(USD 기준가, bare 배열) */
export function listPassPlans(groupId: ID | string, signal?: AbortSignal): Promise<PassPlan[]> {
  return apiFetch<RawPassPlan[]>(`/groups/${groupId}/passes/plans`, { signal }).then((raw) =>
    raw.map(toPassPlan),
  )
}

/**
 * POST /groups/:id/pass-orders — 시장별 주문·금액 준비(201).
 *
 * `Idempotency-Key`(UUID 36자)는 호출부가 **선택 한 벌(모임·상품·시장)마다 하나** 만들어 넘긴다:
 * 같은 키 재요청은 최초 주문을 돌려주므로 중복 탭·응답 유실 재시도가 주문을 늘리지 않고,
 * 다른 내용에 같은 키를 쓰면 서버가 BILLING409로 거부한다(선택을 바꾸면 키도 바꾼다).
 */
export function preparePassOrder(
  groupId: ID | string,
  input: { planCode: PassPlanCode; market: PassMarket },
  idempotencyKey: string,
): Promise<PassOrder> {
  return apiFetch<RawPassOrder>(`/groups/${groupId}/pass-orders`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { planCode: input.planCode, market: input.market.toUpperCase() },
  }).then(toPassOrder)
}

/**
 * POST /groups/:id/pass-orders/:orderId/confirm — Toss 인증 뒤 서버 승인·이용권 활성화.
 * 같은 주문 재호출은 최초 결과를 돌려준다(멱등) — 결과가 불명확한 실패(BILLING502·네트워크)
 * 뒤엔 새 주문이 아니라 **이 호출을 같은 값으로 다시** 한다(BE가 orderId 조회로 조정).
 * paymentKey는 서버로만 보낸다 — 화면은 저장·기록하지 않는다(CHMO-899 AC-9).
 */
export function confirmPassOrder(
  groupId: ID | string,
  orderId: string,
  paymentKey: string,
): Promise<PassConfirmation> {
  return apiFetch<RawPassConfirmation>(
    `/groups/${groupId}/pass-orders/${encodeURIComponent(orderId)}/confirm`,
    { method: 'POST', body: { paymentKey } },
  ).then(toPassConfirmation)
}

/** GET /groups/:id/passes/current — 구매 이력이 없으면 result 생략(→ null) */
export function getCurrentPass(
  groupId: ID | string,
  signal?: AbortSignal,
): Promise<CurrentPass | null> {
  return apiFetch<RawCurrentPass | undefined | null>(`/groups/${groupId}/passes/current`, {
    signal,
  }).then((raw) => (raw ? toCurrentPass(raw) : null))
}
