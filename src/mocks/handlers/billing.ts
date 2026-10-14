/**
 * 기간 이용권 결제 목 (BE CHMO-847 — 웹 결제 CHMO-899).
 *
 * 계약 기준은 BE 스펙 `docs/spec/CHMO-847-*.md` §3. 검증 순서: 인증(COMMON401) → 모임 존재
 * (SPACE404) → 멤버십(비멤버·승인 대기 SPACE403 · 멤버 ROLE403) → 유형(일반 BILLING400) → 입력.
 * 에러 메시지는 실서버 미채집이라 코드만 BE와 맞췄다.
 *
 * 월 구독(billing/setup·payment-method·subscription)은 웹이 쓰지 않아 목도 두지 않는다.
 * 결제창은 목 모드에서 열리지 않는다(lib/tossPayments — 성공 복귀로 SPA 직행) — 그래서 승인
 * 목은 paymentKey 형식을 따지지 않고 "같은 주문의 다른 키 재사용"만 거부한다.
 */
import { http } from 'msw'
import {
  PASS_PLANS,
  approvePassOrder,
  createPassOrder,
  findGroup,
  passOrders,
  spacePasses,
  type DbGroup,
  type DbPassMarket,
  type DbPassPlanCode,
  type DbUser,
} from '../db'
import {
  api,
  created,
  errorResponse,
  groupNotFound,
  invalidBody,
  invalidRequest,
  membershipRoleError,
  ok,
  readJson,
  requiredString,
  spaceForbidden,
  toId,
  unauthorized,
  userFrom,
} from './shared'
import {
  toCurrentPassResponse,
  toPassConfirmResponse,
  toPassOrderResponse,
  toPassPlanResponse,
} from './serializers'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function billingConflict(message: string) {
  return errorResponse(409, 'BILLING409', message)
}

/** 결제 API 공통 관문 — BE BillingAccessGuard(ACTIVE EDITOR + BUSINESS) 대응 */
function billingGroup(request: Request, rawGroupId: unknown): { user: DbUser; group: DbGroup } | Response {
  const user = userFrom(request)
  if (!user) return unauthorized()
  const group = findGroup(toId(rawGroupId))
  if (!group) return groupNotFound()
  const denied = membershipRoleError(user, group.id, 'editor', spaceForbidden)
  if (denied) return denied
  if (group.groupType !== 'business')
    return errorResponse(400, 'BILLING400', '일반 모임은 결제를 지원하지 않습니다.')
  return { user, group }
}

export const billingHandlers = [
  // GET /groups/:id/passes/plans — USD 기준 상품 3종(bare 배열)
  http.get(api('/groups/:id/passes/plans'), ({ request, params }) => {
    const access = billingGroup(request, params.id)
    if (access instanceof Response) return access
    return ok(PASS_PLANS.map(toPassPlanResponse))
  }),

  // POST /groups/:id/pass-orders — 시장별 주문 준비(201). 같은 멱등키 = 같은 주문
  http.post(api('/groups/:id/pass-orders'), async ({ request, params }) => {
    const access = billingGroup(request, params.id)
    if (access instanceof Response) return access
    const key = request.headers.get('Idempotency-Key')
    if (!key || !UUID_RE.test(key)) return invalidRequest('Idempotency-Key 헤더가 올바르지 않습니다.')

    const body = await readJson<{ planCode?: unknown; market?: unknown }>(request)
    if (!body) return invalidBody()
    const planCode = requiredString(body.planCode) as DbPassPlanCode | null
    const market = requiredString(body.market) as DbPassMarket | null
    if (!planCode || !PASS_PLANS.some((p) => p.code === planCode))
      return invalidRequest('이용권 상품이 올바르지 않습니다.')
    if (market !== 'DOMESTIC' && market !== 'INTERNATIONAL')
      return invalidRequest('결제 시장이 올바르지 않습니다.')

    const existing = passOrders.find((o) => o.idempotencyKey === key)
    if (existing) {
      // 같은 키 같은 요청 = 최초 주문 반환, 다른 요청에 같은 키 = 충돌(BE AC-16)
      const same =
        existing.groupId === access.group.id &&
        existing.planCode === planCode &&
        existing.market === market
      return same
        ? created(toPassOrderResponse(existing))
        : billingConflict('다른 요청에 사용된 멱등키입니다.')
    }
    const order = createPassOrder({
      groupId: access.group.id,
      userId: access.user.id,
      idempotencyKey: key,
      planCode,
      market,
    })
    return created(toPassOrderResponse(order))
  }),

  // POST /groups/:id/pass-orders/:orderId/confirm — 승인·이용권 활성화(멱등)
  http.post(api('/groups/:id/pass-orders/:orderId/confirm'), async ({ request, params }) => {
    const access = billingGroup(request, params.id)
    if (access instanceof Response) return access
    const body = await readJson<{ paymentKey?: unknown }>(request)
    if (!body) return invalidBody()
    const paymentKey = requiredString(body.paymentKey)
    if (!paymentKey) return invalidRequest('paymentKey는 필수입니다.')

    const order = passOrders.find((o) => o.orderId === params.orderId)
    if (!order || order.groupId !== access.group.id)
      return billingConflict('이 모임의 주문이 아닙니다.')
    if (order.status === 'SUCCEEDED') {
      return order.paymentKey === paymentKey
        ? ok(toPassConfirmResponse(order))
        : billingConflict('이미 다른 결제로 승인된 주문입니다.')
    }
    if (Date.parse(order.expiresAt) <= Date.now())
      return billingConflict('주문 유효 시간이 지났습니다. 새로 주문해 주세요.')
    return ok(toPassConfirmResponse(approvePassOrder(order, paymentKey)))
  }),

  // GET /groups/:id/passes/current — 이력이 없으면 result 생략
  http.get(api('/groups/:id/passes/current'), ({ request, params }) => {
    const access = billingGroup(request, params.id)
    if (access instanceof Response) return access
    const accessUntil = spacePasses.get(access.group.id)
    return ok(accessUntil ? toCurrentPassResponse(accessUntil) : undefined)
  }),
]
