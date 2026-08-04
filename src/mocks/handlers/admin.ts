/**
 * 관리자 조회 API 목 (CHMO-379 — BE CHMO-377·378 계약).
 *
 * 가드가 라우팅보다 먼저다(실서버 관찰 2026-08-04): 무토큰 COMMON401 → 비관리자 ADMIN403.
 * 관리자면 어느 모임의 멤버가 아니어도 전체 데이터가 보인다(멤버십 관문을 타지 않는 유일한
 * 핸들러 계열 — admin-spec §2-3: 반대로 서비스 API는 role을 쳐다보지 않는다).
 * 응답 조립 전에 분석을 정산해(settleAnalysis) 서비스 화면과 상태·사진 수가 일치한다.
 */
import { http } from 'msw'
import { db, eventsOfGroup, findGroup, settleAnalysis, type DbUser } from '../db'
import {
  adminForbidden,
  api,
  commonBadRequest,
  groupNotFound,
  ok,
  okPaged,
  toId,
  unauthorized,
  userFrom,
} from './shared'
import {
  toAdminGroupDetailResponse,
  toAdminGroupSummary,
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

/** BE 정렬 화이트리스트(createdAt·name × asc·desc) — 밖은 null(COMMON400) */
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
