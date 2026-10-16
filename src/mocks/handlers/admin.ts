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
  ADMIN_STATS_EXCLUDED_USER_IDS,
  albumMappedPhotoCountOfGroup,
  db,
  eventsOfGroup,
  findGroup,
  lastUploadedAtOfGroup,
  latestUploadOfEvent,
  registerOrganizationPeriod,
  settleAnalysis,
  uploadsOfEventExcluding,
  type DbOrganizationInquiry,
  type DbReport,
  type DbUser,
} from '../db'
import {
  adminForbidden,
  api,
  commonBadRequest,
  errorResponse,
  groupNotFound,
  invalidBody,
  invalidRequest,
  ok,
  okPaged,
  parseSubscriptionPeriodInput,
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
  toAdminRecentUpload,
  toAdminReportDetailResponse,
  toAdminReportSummary,
} from './serializers'

const DAY_MS = 24 * 60 * 60 * 1000

/** BE `GetAdminStatsUseCase.RECENT_UPLOAD_LIMIT` */
const RECENT_UPLOAD_LIMIT = 10

/** `/admin/*` 공통 관문 — Response면 그대로 응답한다 */
export function adminGate(request: Request): DbUser | Response {
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
export function intParam(url: URL, name: string, fallback: number): number | null {
  const raw = url.searchParams.get(name)
  if (raw === null || raw === '') return fallback
  const value = Number(raw)
  return Number.isInteger(value) ? value : null
}

/**
 * BE 정렬 화이트리스트(lastUploadedAt·photoCount·createdAt·name × asc·desc — CHMO-932 확장) — 밖은
 * null(COMMON400). 이름은 응답에서 빠졌어도(CHMO-668) 서버 내부 기준으로는 그대로 동작한다 — 목도 BE를
 * 따라 계속 받아 준다(FE 화면은 안 보낸다 — CHMO-670).
 * 마지막 업로드는 **사진 없는 모임이 방향과 무관하게 맨 뒤**(nulls last), 동률은 `createdAt desc ·
 * groupId desc`로 고정해 페이지 경계가 흔들리지 않는다(BE `AdminUploadActivityRepository.pageSpaceIds`).
 */
function groupComparator(sort: string): ((a: number, b: number) => number) | null {
  const parts = sort.split(',')
  if (parts.length !== 2) return null
  const property = parts[0].trim()
  const direction = parts[1].trim()
  const properties = ['lastUploadedAt', 'photoCount', 'createdAt', 'name']
  if (!properties.includes(property) || (direction !== 'asc' && direction !== 'desc')) {
    return null
  }
  const sign = direction === 'asc' ? 1 : -1
  const tieBreak = (a: { id: number; createdAt: string }, b: { id: number; createdAt: string }) =>
    epochOf(b.createdAt) - epochOf(a.createdAt) || b.id - a.id
  return (aId, bId) => {
    const a = db.groups.find((g) => g.id === aId)
    const b = db.groups.find((g) => g.id === bId)
    if (!a || !b) return 0
    if (property === 'lastUploadedAt') {
      const aAt = lastUploadedAtOfGroup(a.id)
      const bAt = lastUploadedAtOfGroup(b.id)
      if (aAt === null || bAt === null) {
        if (aAt === bAt) return tieBreak(a, b)
        return aAt === null ? 1 : -1
      }
      return sign * (epochOf(aAt) - epochOf(bAt)) || tieBreak(a, b)
    }
    if (property === 'photoCount') {
      return (
        sign * (albumMappedPhotoCountOfGroup(a.id) - albumMappedPhotoCountOfGroup(b.id)) || tieBreak(a, b)
      )
    }
    const primary =
      property === 'createdAt'
        ? epochOf(a.createdAt) - epochOf(b.createdAt)
        : a.name.localeCompare(b.name, 'ko')
    // createdAt 동률에서 페이지 경계가 흔들리지 않게 spaceId DESC 보조 정렬(BE와 동일)
    return sign * primary || b.id - a.id
  }
}

/** `groupType` 필터 — 생략은 전체(null), 목록 밖 값은 undefined(COMMON400). BE `SpaceType.valueOf` */
function groupTypeParam(url: URL): 'business' | 'general' | null | undefined {
  const raw = url.searchParams.get('groupType')?.trim()
  if (!raw) return null
  if (raw === 'BUSINESS') return 'business'
  if (raw === 'GENERAL') return 'general'
  return undefined
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

    // 활동 지표·최근 업로드(CHMO-932)는 제외 계정이 올린 사진을 뺀다 — 기존 필드는 전체 기준 그대로
    const excluded = ADMIN_STATS_EXCLUDED_USER_IDS
    const recentUploads = db.events
      .flatMap((event) => {
        const latest = latestUploadOfEvent(event.id, excluded)
        return latest ? [{ event, latest }] : []
      })
      .sort((a, b) => epochOf(b.latest.createdAt) - epochOf(a.latest.createdAt) || b.event.id - a.event.id)
      .slice(0, RECENT_UPLOAD_LIMIT)
    const recentPhotos = db.events.flatMap((event) =>
      uploadsOfEventExcluding(event.id, excluded)
        .filter((p) => epochOf(p.createdAt) >= since)
        .map((p) => ({ groupId: event.groupId, uploadedBy: p.uploadedBy ?? null })),
    )

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
        activeGroups: new Set(recentPhotos.map((p) => p.groupId)).size,
        // 업로더 없는 옛 사진은 세지 않는다(BE `uploadActivitySince`)
        uploaders: new Set(recentPhotos.map((p) => p.uploadedBy).filter((id) => id !== null)).size,
      },
      recentGroups: recentGroups.map(toAdminRecentGroup),
      recentUploads: recentUploads.map(({ event, latest }) => toAdminRecentUpload(event, latest)),
      excludedUserIds: excluded,
    })
  }),

  // GET /admin/groups — 전체 모임 목록(검색·정렬·페이지네이션) · A2
  http.get(api('/admin/groups'), ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate

    const url = new URL(request.url)
    const page = intParam(url, 'page', 0)
    const size = intParam(url, 'size', 20)
    // 기본 정렬은 최근 업로드순(CHMO-932 — BE `@RequestParam(defaultValue = "lastUploadedAt,desc")`)
    const compare = groupComparator(url.searchParams.get('sort') ?? 'lastUploadedAt,desc')
    const groupType = groupTypeParam(url)
    // BE 검증(AdminController.groupListConditionOf)과 같은 조건·같은 코드 — 전부 COMMON400
    if (
      page === null ||
      page < 0 ||
      size === null ||
      size < 1 ||
      size > 100 ||
      !compare ||
      groupType === undefined
    ) {
      return commonBadRequest()
    }

    for (const event of db.events) settleAnalysis(event.id)

    // 이름 검색도 정렬과 같다 — 값은 안 내려가지만 필터 동작은 BE 그대로(FE는 안 보낸다)
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const matched = db.groups
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .filter((g) => groupType === null || g.groupType === groupType)
      .map((g) => g.id)
      .sort(compare)

    const totalElements = matched.length
    const totalPages = Math.ceil(totalElements / size)
    const pageIds = matched.slice(page * size, page * size + size)
    // `.map(toAdminGroupSummary)`로 넘기면 index가 nowMs 자리에 들어가 7일 집계가 전부 "최근"이 된다
    const now = Date.now()
    const items = pageIds
      .map((id) => findGroup(id))
      .filter((g): g is NonNullable<typeof g> => g !== undefined)
      .map((g) => toAdminGroupSummary(g, now))

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

    const body = await readJson<{ status?: unknown; subscriptionPeriod?: unknown }>(request)
    if (!body) return invalidBody()
    const next = INQUIRY_STATUSES.find((status) => status === body.status)
    if (!next) return commonBadRequest()
    // 개통에 동봉한 첫 이용 기간(CHMO-931 — BE CHMO-912 `AdminInquiryStatusRequest.subscriptionPeriod`).
    // BE DTO에 @Valid가 없어 형식 오류는 등록기까지 가서 터진다 — 목은 같은 파서로 VALID400으로 접는다
    const period =
      body.subscriptionPeriod === undefined || body.subscriptionPeriod === null
        ? null
        : parseSubscriptionPeriodInput(body.subscriptionPeriod)
    if (body.subscriptionPeriod != null && !period) return invalidRequest('입력값이 올바르지 않습니다.')

    const id = toId(params.id)
    const inquiry = db.organizationInquiries.find((row) => row.id === id)
    if (!inquiry) return errorResponse(404, 'INQUIRY404', '문의를 찾을 수 없습니다.')

    // 종료분을 진행 중으로 되돌리는데 그 사용자가 이미 새 문의를 낸 경우 — 진행 중은 1건뿐이다
    if (OPEN_INQUIRY_STATUSES.includes(next) && hasOtherOpenInquiry(inquiry)) {
      return errorResponse(409, 'INQUIRY409', '이미 진행 중인 문의가 있습니다.')
    }

    // BE 순서: 상태 저장(flush) → ONBOARDED면 기간 등록(실패하면 트랜잭션 롤백 = 상태도 안 바뀐다)
    if (next === 'ONBOARDED' && period) {
      const registered = registerOrganizationPeriod(gate.id, inquiry.userId, period)
      if (!registered.ok) {
        return registered.code === 'USER404'
          ? errorResponse(404, 'USER404', registered.message)
          : invalidRequest(registered.message)
      }
    }
    inquiry.status = next
    inquiry.updatedAt = new Date().toISOString()
    return ok(toAdminInquiryResponse(inquiry))
  }),
]

// ── 신고·문의 (CHMO-862 — BE CHMO-861 PR #287) ──────────────────────

const REPORT_STATUSES: DbReport['status'][] = ['RECEIVED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED']
const REPORT_TYPES: DbReport['type'][] = [
  'APP_ERROR',
  'CLASSIFICATION',
  'ACCOUNT',
  'OTHER',
  'DELETION_REQUEST',
  'INAPPROPRIATE',
]

/** BE `ReplyAdminReportUseCase.MAX_CONTENT_LENGTH` */
const REPORT_REPLY_MAX = 2000

/**
 * 콤마 복수·`ALL` 쿼리 해석 — BE `AdminReportController.enumValuesOf`와 같은 판정: 비었으면 기본값,
 * `ALL`이면 전부, 그 외는 콤마로 갈라 모두 알려진 값이어야 한다(하나라도 모르면 null = COMMON400).
 */
function enumFilter<T extends string>(raw: string | null, all: T[], fallback: string): T[] | null {
  const value = raw?.trim() ? raw.trim() : fallback
  if (value === 'ALL') return all
  const parts = value.split(',').map((part) => part.trim())
  const matched = parts.filter((part): part is T => (all as string[]).includes(part))
  return matched.length === parts.length && matched.length > 0 ? matched : null
}

function reportNotFound() {
  return errorResponse(404, 'REPORT404', '신고·문의를 찾을 수 없습니다.')
}

export const adminReportHandlers = [
  // GET /admin/reports — 목록(정렬 createdAt,desc · 동률 id DESC 고정)
  http.get(api('/admin/reports'), ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate

    const url = new URL(request.url)
    const page = intParam(url, 'page', 0)
    const size = intParam(url, 'size', 20)
    const statuses = enumFilter(
      url.searchParams.get('status'),
      REPORT_STATUSES,
      'RECEIVED,IN_PROGRESS',
    )
    const types = enumFilter(url.searchParams.get('type'), REPORT_TYPES, 'ALL')
    if (
      page === null ||
      page < 0 ||
      size === null ||
      size < 1 ||
      size > 100 ||
      !statuses ||
      !types
    ) {
      return commonBadRequest()
    }

    const matched = db.reports
      .filter((report) => statuses.includes(report.status) && types.includes(report.type))
      .sort((a, b) => epochOf(b.createdAt) - epochOf(a.createdAt) || b.id - a.id)

    const totalElements = matched.length
    const totalPages = Math.ceil(totalElements / size)
    const items = matched.slice(page * size, page * size + size).map(toAdminReportSummary)

    return okPaged(items, {
      page,
      size,
      hasNext: page + 1 < totalPages,
      totalElements,
      totalPages,
    })
  }),

  // GET /admin/reports/:id — 상세(첨부·사진 presigned · 역할 · 기기 · 이어서 문의 · 답변)
  http.get(api('/admin/reports/:id'), ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const report = db.reports.find((row) => row.id === toId(params.id))
    if (!report) return reportNotFound()
    return ok(toAdminReportDetailResponse(report))
  }),

  /**
   * POST /admin/reports/:id/reply — 답변. 검증 순서는 BE 그대로: @NotBlank(VALID400 필드 메시지) →
   * trim 후 1~2,000자(VALID400 일반 메시지) → 조회(REPORT404). 즉 빈 답변은 없는 id보다 먼저 걸린다.
   * 최초 답변이면 BE가 커밋 후 푸시를 보내는데, 목엔 수신 기기가 없어 발송은 흉내 내지 않는다.
   * 재답변은 내용·시각·답한 관리자만 갈아 끼운다(알림 없음).
   */
  http.post(api('/admin/reports/:id/reply'), async ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate

    const body = await readJson<{ content?: unknown }>(request)
    if (!body) return invalidBody()
    if (typeof body.content !== 'string' || body.content.trim() === '') {
      return invalidRequest('답변 내용은 필수입니다.')
    }
    const content = body.content.trim()
    if (content.length > REPORT_REPLY_MAX) return invalidRequest('입력값이 올바르지 않습니다.')

    const report = db.reports.find((row) => row.id === toId(params.id))
    if (!report) return reportNotFound()

    const now = new Date().toISOString()
    report.replyContent = content
    report.answeredAt = now
    report.answeredBy = gate.id
    report.status = 'ANSWERED'
    report.updatedAt = now
    return ok(toAdminReportDetailResponse(report))
  }),

  /**
   * PATCH /admin/reports/:id — 상태 전이. 전이 규칙 없음(같은 값도 성공). 모르는 값은 본문 역직렬화
   * 실패라 COMMON400, 누락은 @NotNull VALID400. 조회(REPORT404) 뒤에 **답 없는 ANSWERED**만
   * VALID400으로 거절한다(BE `ChangeAdminReportStatusUseCase`와 같은 순서).
   */
  http.patch(api('/admin/reports/:id'), async ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate

    const body = await readJson<{ status?: unknown }>(request)
    if (!body) return invalidBody()
    if (body.status === undefined || body.status === null)
      return invalidRequest('상태는 필수입니다.')
    const next = REPORT_STATUSES.find((status) => status === body.status)
    if (!next) return commonBadRequest()

    const report = db.reports.find((row) => row.id === toId(params.id))
    if (!report) return reportNotFound()
    if (next === 'ANSWERED' && report.replyContent === null) {
      return invalidRequest('입력값이 올바르지 않습니다.')
    }

    report.status = next
    report.updatedAt = new Date().toISOString()
    return ok(toAdminReportSummary(report))
  }),
]
