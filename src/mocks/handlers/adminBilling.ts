/**
 * 관리자 장수·기관 구독 API 목 (CHMO-931 — BE CHMO-912 `AdminController` 어드민 절).
 *
 * 가드·검증 순서는 BE 유스케이스 소스 그대로다: 가드(COMMON401 → ADMIN403) → 바인딩·Bean
 * Validation(COMMON400·VALID400) → `CreditSettings.requireConfigured`(목은 항상 통과 —
 * `CREDIT_SETTINGS`) → 대상 조회(USER404) → 도메인 규칙(CREDIT409 · 기관 계정 VALID400).
 * 커서 목록의 `size`는 BE가 1~50으로 **접는다**(400이 아니다 — 모임 목록과 다른 점).
 * 날짜 규칙은 `admin/lib/billing.ts`와 같은 판정(`shared.parseSubscriptionPeriodInput`).
 */
import { http } from 'msw'
import {
  creditLedgersOf,
  db,
  lockCreditAccount,
  recordCreditLedger,
  registerOrganizationPeriod,
  resolveInstitutionAccess,
} from '../db'
import { adminGate, intParam } from './admin'
import {
  api,
  commonBadRequest,
  created,
  errorResponse,
  invalidBody,
  invalidRequest,
  ok,
  parseSubscriptionPeriodInput,
  readJson,
  requiredString,
  toId,
} from './shared'
import {
  toAdminOrganizationSubscriptionItem,
  toAdminOrganizationSubscriptionResponse,
  toAdminUserCreditsResponse,
  toAdminUserSearchItem,
} from './serializers'

/** BE `Math.max(1, Math.min(size, 50))` — 범위 밖은 접는다. 숫자가 아니면 바인딩 실패(COMMON400) */
function sizeParam(url: URL): number | null {
  const size = intParam(url, 'size', 20)
  return size === null ? null : Math.max(1, Math.min(size, 50))
}

/** `cursor` — 없으면 null(첫 페이지), 숫자가 아니면 undefined(COMMON400) */
function cursorParam(url: URL): number | null | undefined {
  const raw = url.searchParams.get('cursor')
  if (raw === null || raw === '') return null
  const value = Number(raw)
  return Number.isInteger(value) ? value : undefined
}

function userNotFound() {
  return errorResponse(404, 'USER404', '사용자를 찾을 수 없습니다.')
}

export const adminBillingHandlers = [
  // GET /admin/users — 닉네임 부분 일치(대소문자 무시) OR userId 정확 일치 · userId DESC 커서
  http.get(api('/admin/users'), ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const url = new URL(request.url)
    const size = sizeParam(url)
    const cursor = cursorParam(url)
    if (size === null || cursor === undefined) return commonBadRequest()
    const query = (url.searchParams.get('query') ?? '').trim()
    const lowered = query.toLowerCase()

    const rows = db.users
      .filter((u) => cursor === null || u.id < cursor)
      .filter((u) => query === '' || u.nickname.toLowerCase().includes(lowered) || String(u.id) === query)
      .sort((a, b) => b.id - a.id)
    const visible = rows.slice(0, size)
    const hasNext = rows.length > size
    return ok({
      items: visible.map(toAdminUserSearchItem),
      nextCursor: hasNext ? visible[visible.length - 1].id : null,
      hasNext,
    })
  }),

  // GET /admin/users/:userId/credits — 잔액 + 장부(ledgerId DESC 커서). 조회가 계정을 지연 생성한다
  http.get(api('/admin/users/:userId/credits'), ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const url = new URL(request.url)
    const size = sizeParam(url)
    const cursor = cursorParam(url)
    const userId = toId(params.userId)
    if (size === null || cursor === undefined || userId === null) return commonBadRequest()

    const account = lockCreditAccount(userId)
    if (!account) return userNotFound()
    const rows = creditLedgersOf(userId).filter((row) => cursor === null || row.id < cursor)
    const visible = rows.slice(0, size)
    const hasNext = rows.length > size
    return ok(
      toAdminUserCreditsResponse(
        account,
        visible,
        hasNext ? visible[visible.length - 1].id : null,
        hasNext,
      ),
    )
  }),

  /**
   * POST /admin/users/:userId/credit-adjustments — 지급(+)·회수(−). 검증 순서(BE): Bean Validation
   * (delta @NotNull · memo @NotBlank @Size 500) → delta 0 → 사용자 → 음수 잔액(CREDIT409).
   * 지급은 500 상한을 넘겨도 된다(스펙 3.5). 멱등키 없음 — 같은 요청이 두 번 오면 두 번 지급된다.
   */
  http.post(api('/admin/users/:userId/credit-adjustments'), async ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const userId = toId(params.userId)
    if (userId === null) return commonBadRequest()
    const body = await readJson<{ delta?: unknown; memo?: unknown }>(request)
    if (!body) return invalidBody()
    const delta = body.delta
    const memo = requiredString(body.memo)
    if (typeof delta !== 'number' || !Number.isInteger(delta)) return invalidRequest('입력값이 올바르지 않습니다.')
    if (!memo || memo.length > 500) return invalidRequest('입력값이 올바르지 않습니다.')
    if (delta === 0) return invalidRequest('입력값이 올바르지 않습니다.')

    const account = lockCreditAccount(userId)
    if (!account) return userNotFound()
    if (account.balance + delta < 0) {
      return errorResponse(409, 'CREDIT409', '무료 사진 장수가 부족합니다.')
    }
    account.balance += delta
    recordCreditLedger(account, delta, 'ADMIN_ADJUST', { adminId: gate.id, memo })
    return created({ userId, delta, balance: account.balance })
  }),

  // GET /admin/organizations/subscriptions — 구독 행이 있는 기관만 · subscriptionId DESC 커서
  http.get(api('/admin/organizations/subscriptions'), ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const url = new URL(request.url)
    const size = sizeParam(url)
    const cursor = cursorParam(url)
    if (size === null || cursor === undefined) return commonBadRequest()

    const rows = db.organizationSubscriptions
      .filter((s) => cursor === null || s.id < cursor)
      .sort((a, b) => b.id - a.id)
    const visible = rows.slice(0, size)
    const hasNext = rows.length > size
    const now = Date.now()
    return ok({
      items: visible.map((s) => toAdminOrganizationSubscriptionItem(s, resolveInstitutionAccess(s.userId, now))),
      nextCursor: hasNext ? visible[visible.length - 1].id : null,
      hasNext,
    })
  }),

  /**
   * POST /admin/organizations/:userId/subscription-periods — 기간 등록(201). Bean Validation
   * (VALID400) → 등록기(종료≤시작 VALID400 → USER404 → 기관 계정 아님 VALID400) → 구독 지연 생성.
   */
  http.post(api('/admin/organizations/:userId/subscription-periods'), async ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const userId = toId(params.userId)
    if (userId === null) return commonBadRequest()
    const body = await readJson<unknown>(request)
    if (!body) return invalidBody()
    const input = parseSubscriptionPeriodInput(body)
    if (!input) return invalidRequest('입력값이 올바르지 않습니다.')

    const result = registerOrganizationPeriod(gate.id, userId, input)
    if (!result.ok) {
      return result.code === 'USER404' ? userNotFound() : invalidRequest(result.message)
    }
    return created(
      toAdminOrganizationSubscriptionResponse(
        result.user.id,
        result.user.nickname,
        resolveInstitutionAccess(result.user.id),
        result.period,
      ),
    )
  }),

  // DELETE /admin/organization-subscription-periods/:periodId — voidedAt 기록(멱등). 응답 nickname null
  http.delete(api('/admin/organization-subscription-periods/:periodId'), ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const periodId = toId(params.periodId)
    if (periodId === null) return commonBadRequest()
    const period = db.organizationSubscriptionPeriods.find((p) => p.id === periodId)
    if (!period) return errorResponse(404, 'BILLING404', '결제수단 또는 구독을 찾을 수 없습니다.')
    if (period.voidedAt === null) {
      period.voidedAt = new Date().toISOString()
      period.voidedBy = gate.id
    }
    const subscription = db.organizationSubscriptions.find((s) => s.id === period.subscriptionId)
    const userId = subscription?.userId ?? 0
    return ok(
      toAdminOrganizationSubscriptionResponse(userId, null, resolveInstitutionAccess(userId), period),
    )
  }),
]
