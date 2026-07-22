/**
 * 핸들러 공용 헬퍼 — 경로 프리픽스, BE 응답 봉투, 인증/멤버십 해석.
 *
 * 응답 규약은 실 BE와 동일하다(CHMO-195): 성공·실패 모두
 * `{ isSuccess, code, message, result }` 봉투로 내려간다. 언랩·에러 코드 정규화는
 * `src/api/client.ts`·`errors.ts`가 하므로 화면은 봉투를 보지 않는다.
 */
import { HttpResponse } from 'msw'
import { findEvent, isMember, resolveUser, type DbEvent, type DbUser } from '../db'

/** docs/api-spec.md §1 Base URL */
export function api(path: string): string {
  return `/api/v1${path}`
}

// ── BE 응답 봉투 ─────────────────────────────────────────────

/** 성공 봉투 — 리소스는 result에 담긴다(목록은 bare 배열) */
export function ok<T>(result: T) {
  return HttpResponse.json({ isSuccess: true, code: 'COMMON200', message: '성공입니다.', result })
}

/** 생성 성공 봉투 (201) */
export function created<T>(result: T) {
  return HttpResponse.json(
    { isSuccess: true, code: 'COMMON201', message: '성공입니다.', result },
    { status: 201 },
  )
}

/** 본문 없는 성공 (로그아웃) — BE 응답 코드는 미확인 */
export function noContent() {
  return new HttpResponse(null, { status: 204 })
}

/** 실패 봉투 — result 없이 code·message만 (HTTP 200이어도 isSuccess:false면 실패) */
export function errorResponse(status: number, code: string, message: string) {
  return HttpResponse.json({ isSuccess: false, code, message }, { status })
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

/** 본문이 JSON이 아닐 때(readJson → null) 공통 400 */
export function invalidBody() {
  return invalidRequest('요청 본문이 올바르지 않습니다.')
}

/** Authorization 헤더에서 제작자 유저 해석(무효면 null) */
export function userFrom(request: Request): DbUser | null {
  return resolveUser(request.headers.get('Authorization'))
}

/** 멤버 전용 리소스 접근 가능 여부(비멤버에겐 404로 존재를 숨긴다) */
export function canAccessGroup(user: DbUser, groupId: number): boolean {
  return isMember(user.id, groupId)
}

/** 멤버가 접근 가능한 이벤트 조회(없거나 비멤버면 null → 404) */
export function accessibleEvent(user: DbUser, eventId: number | null): DbEvent | null {
  const event = findEvent(eventId)
  if (!event || !canAccessGroup(user, event.groupId)) return null
  return event
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
