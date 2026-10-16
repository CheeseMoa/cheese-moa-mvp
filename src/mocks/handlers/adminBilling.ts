/**
 * 관리자 장수·기관 구독·패스·과금 범위 API 목 (CHMO-931·932 — BE CHMO-912·932 `AdminController` 어드민 절).
 *
 * 가드·검증 순서는 BE 유스케이스 소스 그대로다: 가드(COMMON401 → ADMIN403) → 바인딩·Bean
 * Validation(COMMON400·VALID400) → `CreditSettings.requireConfigured`(목은 항상 통과 —
 * `CREDIT_SETTINGS`) → 대상 조회(USER404·SPACE404) → 도메인 규칙(CREDIT409 · 기관 계정 VALID400 ·
 * 기관 범위 패스 지급 VALID400). 커서 목록의 `size`는 BE가 1~50으로 **접는다**(400이 아니다 — 모임
 * 목록과 다른 점). 날짜 규칙은 `admin/lib/billing.ts`와 같은 판정(`shared.parseSubscriptionPeriodInput`).
 *
 * **쓰기 중복 방지 `Idempotency-Key`(CHMO-932 — ADR 045)**: 장수 조정·기간 등록·패스 지급 셋이 선택 헤더를
 * 받는다. 없으면 종전처럼 매번 실행, UUID가 아니면 COMMON400, 같은 관리자의 같은 키 재요청은 **같은
 * 내용이면 처음 결과를 같은 상태 코드로**, 다른 내용이면 ADMIN409. 실 BE는 각 결과 행에 키·해시를
 * 저장하지만 목은 (관리자, 키) → 결과 맵 하나로 같은 계약을 흉내 낸다(새로고침이면 사라진다).
 */
import { http } from 'msw'
import {
  billingOf,
  creditLedgersOf,
  db,
  findGroup,
  grantSpacePass,
  lockCreditAccount,
  periodHistoryOfOrganizationUser,
  recordCreditLedger,
  registerOrganizationPeriod,
  resolveInstitutionAccess,
  revokeSpacePassGrant,
  type DbAdminPassPlan,
} from '../db'
import { PASS_PLAN_DAYS } from '../../admin/lib/billing'
import { adminGate, intParam } from './admin'
import {
  api,
  commonBadRequest,
  created,
  errorResponse,
  groupNotFound,
  invalidBody,
  invalidRequest,
  ok,
  parseSubscriptionPeriodInput,
  readJson,
  requiredString,
  toId,
} from './shared'
import {
  toAdminBillingScopeResponse,
  toAdminOrganizationSubscriptionHistoryResponse,
  toAdminOrganizationSubscriptionItem,
  toAdminOrganizationSubscriptionResponse,
  toAdminPassGrantResponse,
  toAdminPassGrantRevokeResponse,
  toAdminUserCreditsResponse,
  toAdminUserSearchItem,
  toAdminUserSummaryResponse,
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

function billingNotFound() {
  return errorResponse(404, 'BILLING404', '결제수단 또는 구독을 찾을 수 없습니다.')
}

// ── Idempotency-Key (BE `AdminIdempotency` — CHMO-932) ───────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** (관리자, 키) → 처음 처리한 결과. 실 BE는 각 결과 행의 `request_key`·`request_hash`가 이 역할을 한다 */
const processed = new Map<string, { hash: string; status: number; body: unknown }>()

type IdempotencyKey = { key: string; hash: string } | null

/**
 * 헤더 해석 — 없으면 null(종전 동작), UUID 형식이 아니면 undefined(COMMON400). 지문은 BE처럼 "대상 ID +
 * 본문"을 JSON으로 직렬화한 값이다(SHA-256 대신 문자열 자체 — 목엔 충돌 걱정이 없다).
 */
function idempotencyOf(request: Request, fingerprint: unknown): IdempotencyKey | undefined {
  const raw = request.headers.get('Idempotency-Key')
  if (raw === null || raw === '') return null
  if (!UUID_RE.test(raw)) return undefined
  return { key: raw, hash: JSON.stringify(fingerprint) }
}

/** 이미 처리한 키면 그 결과(같은 내용) 또는 ADMIN409(다른 내용). 처음이면 null — 호출부가 실행 후 `remember`한다 */
function replay(adminId: number, idem: IdempotencyKey): Response | null {
  if (!idem) return null
  const previous = processed.get(`${adminId}:${idem.key}`)
  if (!previous) return null
  if (previous.hash !== idem.hash) {
    return errorResponse(409, 'ADMIN409', '같은 Idempotency-Key로 다른 요청이 이미 처리되었습니다.')
  }
  return previous.status === 201 ? created(previous.body) : ok(previous.body)
}

function remember(adminId: number, idem: IdempotencyKey, status: 200 | 201, body: unknown): void {
  if (!idem) return
  processed.set(`${adminId}:${idem.key}`, { hash: idem.hash, status, body })
}

/** 테스트·재시드용 — 처리 이력을 비운다 */
export function resetAdminIdempotency(): void {
  processed.clear()
}

const PASS_PLANS: DbAdminPassPlan[] = Object.keys(PASS_PLAN_DAYS) as DbAdminPassPlan[]

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

  // GET /admin/users/:userId — 사용자 요약(CHMO-932 A-5). 없으면 USER404
  http.get(api('/admin/users/:userId'), ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const userId = toId(params.userId)
    if (userId === null) return commonBadRequest()
    const user = db.users.find((u) => u.id === userId)
    if (!user) return userNotFound()
    return ok(toAdminUserSummaryResponse(user))
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
   * (delta @NotNull · memo @NotBlank @Size 500) → 키 재요청 판정 → delta 0 → 사용자 → 음수 잔액(CREDIT409).
   * 지급은 500 상한을 넘겨도 된다(스펙 3.5).
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
    const idem = idempotencyOf(request, { userId, delta, memo })
    if (idem === undefined) return commonBadRequest()
    const replayed = replay(gate.id, idem)
    if (replayed) return replayed
    if (delta === 0) return invalidRequest('입력값이 올바르지 않습니다.')

    const account = lockCreditAccount(userId)
    if (!account) return userNotFound()
    if (account.balance + delta < 0) {
      return errorResponse(409, 'CREDIT409', '무료 사진 장수가 부족합니다.')
    }
    account.balance += delta
    recordCreditLedger(account, delta, 'ADMIN_ADJUST', { adminId: gate.id, memo })
    const result = { userId, delta, balance: account.balance }
    remember(gate.id, idem, 201, result)
    return created(result)
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
   * GET /admin/organizations/:userId/subscription — 기간 이력(CHMO-932 A-4). 없는 사용자 USER404 →
   * 기관 계정 아님 VALID400 → 구독 행이 없으면 빈 이력 + BLOCKED(404가 아니다).
   */
  http.get(api('/admin/organizations/:userId/subscription'), ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const userId = toId(params.userId)
    if (userId === null) return commonBadRequest()
    const user = db.users.find((u) => u.id === userId)
    if (!user) return userNotFound()
    if (user.accountType !== 'ORGANIZATION') return invalidRequest('기관 계정만 구독 이력이 있습니다.')
    return ok(
      toAdminOrganizationSubscriptionHistoryResponse(
        user,
        resolveInstitutionAccess(userId),
        periodHistoryOfOrganizationUser(userId),
      ),
    )
  }),

  /**
   * POST /admin/organizations/:userId/subscription-periods — 기간 등록(201). Bean Validation
   * (VALID400) → 키 재요청 판정 → 등록기(종료≤시작 VALID400 → USER404 → 기관 계정 아님 VALID400) → 구독 지연 생성.
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
    const idem = idempotencyOf(request, { userId, input })
    if (idem === undefined) return commonBadRequest()
    const replayed = replay(gate.id, idem)
    if (replayed) return replayed

    const result = registerOrganizationPeriod(gate.id, userId, input)
    if (!result.ok) {
      return result.code === 'USER404' ? userNotFound() : invalidRequest(result.message)
    }
    const response = toAdminOrganizationSubscriptionResponse(
      result.user.id,
      result.user.nickname,
      resolveInstitutionAccess(result.user.id),
      result.period,
    )
    remember(gate.id, idem, 201, response)
    return created(response)
  }),

  // DELETE /admin/organization-subscription-periods/:periodId — voidedAt 기록(멱등). 응답 nickname null
  http.delete(api('/admin/organization-subscription-periods/:periodId'), ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const periodId = toId(params.periodId)
    if (periodId === null) return commonBadRequest()
    const period = db.organizationSubscriptionPeriods.find((p) => p.id === periodId)
    if (!period) return billingNotFound()
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

  /**
   * POST /admin/groups/:groupId/pass-grants — 운영자 패스 지급(201 · CHMO-932 A-8). Bean Validation
   * (plan enum · memo 필수 500자) → 키 재요청 판정 → 모임(SPACE404) → 기관 범위 VALID400 → 누적 지급.
   */
  http.post(api('/admin/groups/:groupId/pass-grants'), async ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const groupId = toId(params.groupId)
    if (groupId === null) return commonBadRequest()
    const body = await readJson<{ plan?: unknown; memo?: unknown }>(request)
    if (!body) return invalidBody()
    // 모르는 플랜은 enum 역직렬화 실패(COMMON400), 누락은 @NotNull(VALID400) — BE와 같은 갈래
    if (body.plan === undefined || body.plan === null) return invalidRequest('입력값이 올바르지 않습니다.')
    const plan = PASS_PLANS.find((p) => p === body.plan)
    if (!plan) return commonBadRequest()
    const memo = requiredString(body.memo)
    if (!memo || memo.length > 500) return invalidRequest('입력값이 올바르지 않습니다.')
    const idem = idempotencyOf(request, { groupId, plan, memo })
    if (idem === undefined) return commonBadRequest()
    const replayed = replay(gate.id, idem)
    if (replayed) return replayed

    const group = findGroup(groupId)
    if (!group) return groupNotFound()
    if (billingOf(group).scope === 'INSTITUTION') {
      return invalidRequest('기관 범위 모임은 이용 기간으로 등록합니다.')
    }
    const grant = grantSpacePass({
      adminId: gate.id,
      groupId,
      plan,
      memo,
      requestKey: idem?.key ?? null,
      requestHash: idem?.hash ?? null,
    })
    const response = toAdminPassGrantResponse(grant)
    remember(gate.id, idem, 201, response)
    return created(response)
  }),

  // DELETE /admin/pass-grants/:grantId — 회수(멱등 — 이미 회수면 같은 결과). 없으면 BILLING404
  http.delete(api('/admin/pass-grants/:grantId'), ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const grantId = toId(params.grantId)
    if (grantId === null) return commonBadRequest()
    const result = revokeSpacePassGrant(gate.id, grantId)
    if (!result) return billingNotFound()
    return ok(toAdminPassGrantRevokeResponse(result.grant, result.passAccessUntil))
  }),

  /**
   * PUT /admin/groups/:groupId/billing-scope — 과금 범위·소유자 변경(BE CHMO-912 `ChangeSpaceBillingScopeUseCase`).
   * Bean Validation(VALID400) → 모임(SPACE404) → 소유자(USER404) → 기관 범위인데 기관 계정 아님(VALID400).
   * 감사 이력(`space_billing_scope_history`)은 목에 테이블이 없어 남기지 않는다 — 응답 계약만 맞춘다.
   */
  http.put(api('/admin/groups/:groupId/billing-scope'), async ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const groupId = toId(params.groupId)
    if (groupId === null) return commonBadRequest()
    const body = await readJson<{ billingScope?: unknown; billingOwnerUserId?: unknown; memo?: unknown }>(
      request,
    )
    if (!body) return invalidBody()
    if (body.billingScope === undefined || body.billingScope === null)
      return invalidRequest('입력값이 올바르지 않습니다.')
    if (body.billingScope !== 'PERSONAL' && body.billingScope !== 'INSTITUTION') return commonBadRequest()
    const ownerUserId = body.billingOwnerUserId
    const memo = requiredString(body.memo)
    if (typeof ownerUserId !== 'number' || !Number.isInteger(ownerUserId))
      return invalidRequest('입력값이 올바르지 않습니다.')
    if (!memo || memo.length > 500) return invalidRequest('입력값이 올바르지 않습니다.')

    const group = findGroup(groupId)
    if (!group) return groupNotFound()
    const owner = db.users.find((u) => u.id === ownerUserId)
    if (!owner) return userNotFound()
    if (body.billingScope === 'INSTITUTION' && owner.accountType !== 'ORGANIZATION') {
      return invalidRequest('기관 과금 범위의 소유자는 기관 계정이어야 합니다.')
    }
    group.billingScope = body.billingScope
    group.billingOwnerUserId = ownerUserId
    return ok(toAdminBillingScopeResponse(group))
  }),
]
