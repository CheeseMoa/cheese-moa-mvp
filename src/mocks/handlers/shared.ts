/**
 * 핸들러 공용 헬퍼 — 경로 프리픽스, BE 응답 봉투, 인증/멤버십 해석.
 *
 * 응답 규약은 실 BE와 동일하다(CHMO-195): 성공·실패 모두
 * `{ isSuccess, code, message, result }` 봉투로 내려간다. 언랩·에러 코드 정규화는
 * `src/api/client.ts`·`errors.ts`가 하므로 화면은 봉투를 보지 않는다.
 */
import { HttpResponse } from 'msw'
import {
  findEvent,
  membershipOf,
  resolveUser,
  type DbEvent,
  type DbMemberRole,
  type DbUser,
} from '../db'

/** docs/api-spec.md §1 Base URL */
export function api(path: string): string {
  return `/api/v1${path}`
}

// ── BE 응답 봉투 ─────────────────────────────────────────────

/**
 * 요청 추적 ID — 실 BE는 **성공·실패 가리지 않고 모든 응답**에 싣는다(BE CHMO-493,
 * 2026-07-30 실서버 실측: 12자 hex). 목도 실어야 에러 화면의 제보용 식별 문구(CHMO-500)가
 * 목 모드에서 그려지고, 스위치 양쪽(`VITE_ENABLE_MSW` true/false)이 같은 계약을 탄다.
 * 값은 요청마다 새로 발급된다 — 실 BE처럼 재현되지 않는다.
 */
function requestIdHeaders(): Record<string, string> {
  return { 'X-Request-Id': crypto.randomUUID().replace(/-/g, '').slice(0, 12) }
}

/** 성공 봉투 — 리소스는 result에 담긴다(목록은 bare 배열) */
export function ok<T>(result: T) {
  return HttpResponse.json(
    { isSuccess: true, code: 'COMMON200', message: '성공입니다.', result },
    { headers: requestIdHeaders() },
  )
}

/**
 * BE PageInfo(Response.onSuccess(status, Page) — CHMO-378 어드민 목록) — 봉투에 result와
 * 나란히 실린다. 필드명·형태는 BE common/response/PageInfo 그대로.
 */
export interface MockPageInfo {
  page: number
  size: number
  hasNext: boolean
  totalElements: number
  totalPages: number
}

/** 페이지네이션 성공 봉투 — pageInfo가 result 앞에 동봉된다(BE @JsonPropertyOrder와 동일) */
export function okPaged<T>(result: T, pageInfo: MockPageInfo) {
  return HttpResponse.json(
    { isSuccess: true, code: 'COMMON200', message: '성공입니다.', pageInfo, result },
    { headers: requestIdHeaders() },
  )
}

/** 생성 성공 봉투 (201) */
export function created<T>(result: T) {
  return HttpResponse.json(
    { isSuccess: true, code: 'COMMON201', message: '성공입니다.', result },
    { status: 201, headers: requestIdHeaders() },
  )
}

/** 본문 없는 성공 (로그아웃) — BE 응답 코드는 미확인 */
export function noContent() {
  return new HttpResponse(null, { status: 204, headers: requestIdHeaders() })
}

/** 실패 봉투 — result 없이 code·message만 (HTTP 200이어도 isSuccess:false면 실패) */
export function errorResponse(status: number, code: string, message: string) {
  return HttpResponse.json(
    { isSuccess: false, code, message },
    { status, headers: requestIdHeaders() },
  )
}

/**
 * 에러 코드는 실서버 채집 또는 **BE 소스로 확인된 것만** BE 코드를 쓴다(`src/test/fixtures/be.ts` —
 * PUBLISH409는 2026-07-22 실서버 채집, PUBLISH400은 CHMO-324 PR#91·스펙 §3 대조).
 * 확인되지 않은 케이스(닉네임 중복·이미 멤버)는 FE 의미 코드를
 * 그대로 둔다 — `errors.ts`는 미지의 코드를 통과시키므로 화면 분기는 그대로 동작하고,
 * 추측한 코드를 BE 진실 테이블에 굳히지 않는다. BE 코드를 확인하면 여기와 errors.ts만 고친다.
 */

/** 인증 필요/토큰 무효 — BE COMMON401 */
export function unauthorized() {
  return errorResponse(401, 'COMMON401', '인증이 필요합니다.')
}

/** BE 코드 미확인 — 공유 링크 404는 채집되지 않았다 */
export function notFound(message = '리소스를 찾을 수 없습니다.') {
  return errorResponse(404, 'NOT_FOUND', message)
}

/** 모임 없음 — BE SPACE404(BE 도메인명이 space다 · 2026-07-16 채집, CHMO-285) */
export function groupNotFound() {
  return errorResponse(404, 'SPACE404', '모임을 찾을 수 없습니다.')
}

/** 이벤트 없음 — BE MOMENT404(BE 도메인명이 moment다) */
export function eventNotFound() {
  return errorResponse(404, 'MOMENT404', '이벤트를 찾을 수 없습니다.')
}

/** 앨범 없음 — BE ALBUM404 */
export function albumNotFound() {
  return errorResponse(404, 'ALBUM404', '앨범을 찾을 수 없습니다.')
}

/** 검증 실패 — BE VALID400(업로드 키 불일치 응답에서 채집: 도메인 무관 공용 검증 코드) */
export function invalidRequest(message: string) {
  return errorResponse(400, 'VALID400', message)
}

/**
 * 관리자가 아님 — BE ADMIN403(2026-08-04 실서버 채집, CHMO-377 가드). `/admin/*` 전용이라
 * 대상 은닉 없이 곧바로 403이다(비로그인은 COMMON401 — 순서도 실서버 관찰과 동일).
 */
export function adminForbidden() {
  return errorResponse(403, 'ADMIN403', '관리자 권한이 필요합니다.')
}

/** 요청 파라미터 검증 실패 — BE COMMON400(_BAD_REQUEST, 소스 대조 — 어드민 목록 sort·size) */
export function commonBadRequest() {
  return errorResponse(400, 'COMMON400', '잘못된 요청입니다.')
}

/** 본문이 JSON이 아닐 때(readJson → null) 공통 400 */
export function invalidBody() {
  return invalidRequest('요청 본문이 올바르지 않습니다.')
}

/** role 부족(ACTIVE 멤버지만 권한 없음) — BE ROLE403(학부모 전환 Q5 확정, SPACE404 은닉과 구분) */
export function roleForbidden(message = '이 작업을 할 수 있는 권한이 없습니다.') {
  return errorResponse(403, 'ROLE403', message)
}

/**
 * 멤버십 없음/승인 전 — BE SPACE403(NOT_SPACE_MEMBER — CHMO-475 완료 공지 기준, 메시지는
 * 실서버 미채집). 멤버 내보내기·나가기(CHMO-525)가 모임 존재를 흘리지 않는 응답으로 쓴다.
 */
export function spaceForbidden(message = '모임에 참여하고 있지 않습니다.') {
  return errorResponse(403, 'SPACE403', message)
}

/** Authorization 헤더에서 제작자 유저 해석(무효면 null) */
export function userFrom(request: Request): DbUser | null {
  return resolveUser(request.headers.get('Authorization'))
}

/**
 * role 전용 액션 관문(§6 — 학부모 차단은 서버 403 강제, FE 버튼 숨김은 보조).
 * null이면 통과. 비멤버·PENDING은 존재 은닉(hide — §7-2 deny-by-default),
 * ACTIVE지만 role이 다르면 ROLE403(Q5). 선생님·학부모 양쪽 관문이 이 한 구현을 쓴다 —
 * 승인 상태 규칙이 바뀌어도 두 API의 403/404 계약이 함께 움직인다.
 */
export function membershipRoleError(
  user: DbUser,
  groupId: number,
  role: DbMemberRole,
  hide: () => Response = groupNotFound,
): Response | null {
  const membership = membershipOf(user.id, groupId)
  if (membership?.status !== 'active') return hide()
  if (membership.role !== role) return roleForbidden()
  return null
}

/** 제작자(TEACHER) 전용 액션 관문 — 업로드·검수·공개·설정·초대·매핑 전부(§6) */
export function teacherOnlyError(
  user: DbUser,
  groupId: number,
  hide: () => Response = groupNotFound,
): Response | null {
  return membershipRoleError(user, groupId, 'teacher', hide)
}

/**
 * 제작자 전용 이벤트 관문 — 이벤트 핸들러 대부분(생성·상세·업로드·검수·공개·설정)은
 * TEACHER 전용이다(§6). 반환이 Response면 그대로 응답한다.
 */
export function teacherEvent(user: DbUser, eventId: number | null): DbEvent | Response {
  const event = findEvent(eventId)
  if (!event) return eventNotFound()
  return teacherOnlyError(user, event.groupId, eventNotFound) ?? event
}

/**
 * 경로 파라미터/본문의 리소스 id 정규화(BE int64 = 숫자) — 숫자 문자열도 허용.
 * 양의 정수가 아니면 null(존재할 수 없는 id — 호출부에서 404/400 처리).
 */
export function toId(value: unknown): number | null {
  const id = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null
}

/** 요청 본문 JSON 파싱 — 형식 오류면 null (핸들러에서 400 처리) */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

/**
 * 필수 문자열 필드 정규화 — 문자열이 아니거나 trim 후 비어 있으면 null(호출부에서 400).
 * 저장할 때와 비교할 때 반드시 같은 관문을 거쳐 trim/타입 비대칭을 막는다.
 */
export function requiredString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

/** 선택 문자열 필드(PATCH 부분 업데이트용) — 미전송이면 undefined 유지, 전송됐으면 requiredString 규칙 */
export function optionalString(value: unknown): string | null | undefined {
  return value === undefined ? undefined : requiredString(value)
}

/**
 * 필수 id 배열(photoIds 등) — 배열이 아니거나 비었거나 유효하지 않은 id가 섞여 있으면
 * null(호출부에서 400). 중복 id는 제거해 movedCount/removedCount 부풀림을 막는다.
 */
export function requiredIdArray(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const items: number[] = []
  for (const entry of value) {
    const id = toId(entry)
    if (id === null) return null
    if (!items.includes(id)) items.push(id)
  }
  return items
}
