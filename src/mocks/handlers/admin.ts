/**
 * 관리자 조회 API 목 (CHMO-379 — BE CHMO-377·378 계약).
 *
 * 가드가 라우팅보다 먼저다(실서버 관찰 2026-08-04): 무토큰 COMMON401 → 비관리자 ADMIN403.
 * 관리자면 어느 모임의 멤버가 아니어도 전체 데이터가 보인다(멤버십 관문을 타지 않는 유일한
 * 핸들러 계열 — admin-spec §2-3: 반대로 서비스 API는 role을 쳐다보지 않는다).
 * 응답 조립 전에 분석을 정산해(settleAnalysis) 서비스 화면과 상태·사진 수가 일치한다.
 */
import { http } from 'msw'
import {
  db,
  eventsOfGroup,
  findGroup,
  settleAnalysis,
  type DbOrganizationInquiry,
  type DbUser,
} from '../db'
import {
  adminForbidden,
  api,
  commonBadRequest,
  errorResponse,
  groupNotFound,
  invalidBody,
  ok,
  okPaged,
  readJson,
  toId,
  unauthorized,
  userFrom,
} from './shared'
import {
  toAdminGroupDetailResponse,
  toAdminGroupSummary,
  toAdminInquiryResponse,
  toAdminProfileResponse,
  toAdminRecentGroup,
} from './serializers'

const DAY_MS = 24 * 60 * 60 * 1000

/** `/admin/*` 공통 관문 — Response면 그대로 응답한다 */
function adminGate(request: Request): DbUser | Response {
  const user = userFrom(request)
  if (!user) return unauthorized()
  if (user.role !== 'ADMIN') return adminForbidden()
  return user
}

/** 시드가 +09:00, 신규 발급이 Z(UTC)로 섞여 있어 문자열 비교가 아니라 epoch로 비교한다 */
function epochOf(iso: string): number {
  return new Date(iso).getTime()
}

/** 쿼리 파라미터 정수 해석 — 없으면 기본값, 숫자가 아니면 null(BE 바인딩 실패 = COMMON400) */
function intParam(url: URL, name: string, fallback: number): number | null {
  const raw = url.searchParams.get(name)
  if (raw === null || raw === '') return fallback
  const value = Number(raw)
  return Number.isInteger(value) ? value : null
}

/**
 * BE 정렬 화이트리스트(createdAt·name × asc·desc) — 밖은 null(COMMON400).
 * 이름은 응답에서 빠졌어도(CHMO-668) 서버 내부 기준으로는 그대로 동작한다 — 목도 BE를 따라
 * 계속 받아 준다(FE 화면은 안 보낸다 — CHMO-670).
 */
function groupComparator(sort: string): ((a: number, b: number) => number) | null {
  const parts = sort.split(',')
  if (parts.length !== 2) return null
  const property = parts[0].trim()
  const direction = parts[1].trim()
  if ((property !== 'createdAt' && property !== 'name') || (direction !== 'asc' && direction !== 'desc')) {
    return null
  }
  const sign = direction === 'asc' ? 1 : -1
  return (aId, bId) => {
    const a = db.groups.find((g) => g.id === aId)
    const b = db.groups.find((g) => g.id === bId)
    if (!a || !b) return 0
    const primary =
      property === 'createdAt'
        ? epochOf(a.createdAt) - epochOf(b.createdAt)
        : a.name.localeCompare(b.name, 'ko')
    // createdAt 동률에서 페이지 경계가 흔들리지 않게 spaceId DESC 보조 정렬(BE와 동일)
    return sign * primary || b.id - a.id
  }
}

export const adminHandlers = [
  // GET /admin/me — 관리자 본인 확인(CHMO-377) · FE 어드민 진입 게이트
  http.get(api('/admin/me'), ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    return ok(toAdminProfileResponse(gate))
  }),

  // GET /admin/stats — 대시보드 지표 · A1
  http.get(api('/admin/stats'), ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    for (const event of db.events) settleAnalysis(event.id)

    const since = Date.now() - 7 * DAY_MS
    const recentGroups = [...db.groups]
      .sort((a, b) => epochOf(b.createdAt) - epochOf(a.createdAt) || b.id - a.id)
      .slice(0, 5)

    return ok({
      // 총 사진은 photo 행 count(BE 정책 결정 — 업로드 기록이 아니라 실제 존재하는 사진)
      totals: {
        users: db.users.length,
        groups: db.groups.length,
        events: db.events.length,
        photos: db.photos.length,
      },
      last7Days: {
        newGroups: db.groups.filter((g) => epochOf(g.createdAt) >= since).length,
        newEvents: db.events.filter((e) => epochOf(e.createdAt) >= since).length,
        newPhotos: db.photos.filter((p) => epochOf(p.createdAt) >= since).length,
      },
      recentGroups: recentGroups.map(toAdminRecentGroup),
    })
  }),

  // GET /admin/groups — 전체 모임 목록(검색·정렬·페이지네이션) · A2
  http.get(api('/admin/groups'), ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate

    const url = new URL(request.url)
    const page = intParam(url, 'page', 0)
    const size = intParam(url, 'size', 20)
    const compare = groupComparator(url.searchParams.get('sort') ?? 'createdAt,desc')
    // BE 검증(AdminController.groupPageRequestOf)과 같은 조건·같은 코드 — 전부 COMMON400
    if (page === null || page < 0 || size === null || size < 1 || size > 100 || !compare) {
      return commonBadRequest()
    }

    for (const event of db.events) settleAnalysis(event.id)

    // 이름 검색도 정렬과 같다 — 값은 안 내려가지만 필터 동작은 BE 그대로(FE는 안 보낸다)
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const matched = db.groups
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .map((g) => g.id)
      .sort(compare)

    const totalElements = matched.length
    const totalPages = Math.ceil(totalElements / size)
    const pageIds = matched.slice(page * size, page * size + size)
    const items = pageIds
      .map((id) => findGroup(id))
      .filter((g): g is NonNullable<typeof g> => g !== undefined)
      .map(toAdminGroupSummary)

    return okPaged(items, {
      page,
      size,
      hasNext: page + 1 < totalPages,
      totalElements,
      totalPages,
    })
  }),

  // GET /admin/groups/:groupId — 모임 상세(멤버 PENDING 포함 + 이벤트 전건) · A3
  http.get(api('/admin/groups/:groupId'), ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const group = findGroup(toId(params.groupId))
    if (!group) return groupNotFound()
    for (const event of eventsOfGroup(group.id)) settleAnalysis(event.id)
    return ok(toAdminGroupDetailResponse(group))
  }),
]

// ── 기관 도입 문의 (CHMO-811 — BE CHMO-810 PR #271) ─────────────────

const INQUIRY_STATUSES: DbOrganizationInquiry['status'][] = [
  'RECEIVED',
  'CONTACTED',
  'ONBOARDED',
  'CLOSED',
]

/** '진행 중' = 접수됨·연락 완료 — 목록 기본 필터이자 "사용자당 1건" 제약의 범위(CHMO-802) */
const OPEN_INQUIRY_STATUSES: DbOrganizationInquiry['status'][] = ['RECEIVED', 'CONTACTED']

/**
 * `status` 쿼리 해석 — 생략하면 기본값(진행 중), `ALL`이면 전부, 그 외는 콤마 복수.
 * 목록 밖 값이 하나라도 섞이면 null(COMMON400) — BE와 같은 판정이다.
 */
function inquiryStatusFilter(raw: string | null): DbOrganizationInquiry['status'][] | null {
  const value = raw?.trim() ? raw.trim() : 'RECEIVED,CONTACTED'
  if (value === 'ALL') return INQUIRY_STATUSES
  const parts = value.split(',').map((part) => part.trim())
  const matched = parts.filter((part): part is DbOrganizationInquiry['status'] =>
    (INQUIRY_STATUSES as string[]).includes(part),
  )
  return matched.length === parts.length && matched.length > 0 ? matched : null
}

/** 그 유저에게 진행 중 문의가 (이 행 말고) 또 있나 — 되돌리기 충돌(INQUIRY409) 판정 */
function hasOtherOpenInquiry(inquiry: DbOrganizationInquiry): boolean {
  return db.organizationInquiries.some(
    (other) =>
      other.userId === inquiry.userId &&
      other.id !== inquiry.id &&
      OPEN_INQUIRY_STATUSES.includes(other.status),
  )
}

export const adminInquiryHandlers = [
  // GET /admin/organization-inquiries — 목록(정렬 createdAt,desc 고정 · sort 파라미터 없음)
  http.get(api('/admin/organization-inquiries'), ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate

    const url = new URL(request.url)
    const page = intParam(url, 'page', 0)
    const size = intParam(url, 'size', 20)
    const statuses = inquiryStatusFilter(url.searchParams.get('status'))
    if (page === null || page < 0 || size === null || size < 1 || size > 100 || !statuses) {
      return commonBadRequest()
    }

    const matched = db.organizationInquiries
      .filter((inquiry) => statuses.includes(inquiry.status))
      // 접수 역순 — 동시각은 id DESC로 고정해 페이지 경계가 흔들리지 않는다(모임 목록과 동일)
      .sort((a, b) => epochOf(b.createdAt) - epochOf(a.createdAt) || b.id - a.id)

    const totalElements = matched.length
    const totalPages = Math.ceil(totalElements / size)
    const items = matched.slice(page * size, page * size + size).map(toAdminInquiryResponse)

    return okPaged(items, {
      page,
      size,
      hasNext: page + 1 < totalPages,
      totalElements,
      totalPages,
    })
  }),

  /**
   * PATCH /admin/organization-inquiries/:id — 상태 전이.
   * **전이 규칙을 두지 않는다**(BE CHMO-810 결정) — 어느 상태에서 어느 상태로든 가고, 같은
   * 값 재요청도 그대로 저장한다. 실패는 없는 id(INQUIRY404)와 되돌리기 충돌(INQUIRY409) 둘뿐.
   * 두 코드는 BE 티켓 코멘트(CHMO-810) 대조분이고 **메시지 문구는 미채집**이라 BE 어투로 둔다.
   */
  http.patch(api('/admin/organization-inquiries/:id'), async ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate

    const body = await readJson<{ status?: unknown }>(request)
    if (!body) return invalidBody()
    const next = INQUIRY_STATUSES.find((status) => status === body.status)
    if (!next) return commonBadRequest()

    const id = toId(params.id)
    const inquiry = db.organizationInquiries.find((row) => row.id === id)
    if (!inquiry) return errorResponse(404, 'INQUIRY404', '문의를 찾을 수 없습니다.')

    // 종료분을 진행 중으로 되돌리는데 그 사용자가 이미 새 문의를 낸 경우 — 진행 중은 1건뿐이다
    if (OPEN_INQUIRY_STATUSES.includes(next) && hasOtherOpenInquiry(inquiry)) {
      return errorResponse(409, 'INQUIRY409', '이미 진행 중인 문의가 있습니다.')
    }

    inquiry.status = next
    inquiry.updatedAt = new Date().toISOString()
    return ok(toAdminInquiryResponse(inquiry))
  }),
]
