/**
 * 핸들러 공용 헬퍼 — 경로 프리픽스, 공통 에러 포맷, 인증/멤버십 해석.
 */
import { HttpResponse } from 'msw'
import { findEvent, isMember, resolveUser, type DbEvent, type DbUser } from '../db'

/** docs/api-spec.md §1 Base URL */
export function api(path: string): string {
  return `/api/v1${path}`
}

/** 공통 에러 포맷 { error: { code, message } } */
export function errorResponse(status: number, code: string, message: string) {
  return HttpResponse.json({ error: { code, message } }, { status })
}

export function unauthorized() {
  return errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
}

export function notFound(message = '리소스를 찾을 수 없습니다.') {
  return errorResponse(404, 'NOT_FOUND', message)
}

/** 본문이 JSON이 아닐 때(readJson → null) 공통 400 */
export function invalidBody() {
  return errorResponse(400, 'VALIDATION_ERROR', '요청 본문이 올바르지 않습니다.')
}

/** Authorization 헤더에서 제작자 유저 해석(무효면 null) */
export function userFrom(request: Request): DbUser | null {
  return resolveUser(request.headers.get('Authorization'))
}

/** 멤버 전용 리소스 접근 가능 여부(비멤버에겐 404로 존재를 숨긴다) */
export function canAccessGroup(user: DbUser, groupId: string): boolean {
  return isMember(user.id, groupId)
}

/** 멤버가 접근 가능한 이벤트 조회(없거나 비멤버면 null → 404) */
export function accessibleEvent(user: DbUser, eventId: string): DbEvent | null {
  const event = findEvent(eventId)
  if (!event || !canAccessGroup(user, event.groupId)) return null
  return event
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
 * 필수 문자열 배열(photoIds 등) — 배열이 아니거나 비었거나 빈 문자열이 섞여 있으면
 * null(호출부에서 400). 중복 id는 제거해 movedCount/removedCount 부풀림을 막는다.
 */
export function requiredStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const items: string[] = []
  for (const entry of value) {
    const item = requiredString(entry)
    if (!item) return null
    if (!items.includes(item)) items.push(item)
  }
  return items
}
