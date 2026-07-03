/**
 * 핸들러 공용 헬퍼 — 경로 프리픽스, 공통 에러 포맷, 인증/멤버십 해석.
 */
import { HttpResponse } from 'msw'
import { isMember, resolveUser, type DbUser } from '../db'

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

/** Authorization 헤더에서 제작자 유저 해석(무효면 null) */
export function userFrom(request: Request): DbUser | null {
  return resolveUser(request.headers.get('Authorization'))
}

/** 멤버 전용 리소스 접근 가능 여부(비멤버에겐 404로 존재를 숨긴다) */
export function canAccessGroup(user: DbUser, groupId: string): boolean {
  return isMember(user.id, groupId)
}

/** 요청 본문 JSON 파싱 — 형식 오류면 null (핸들러에서 400 처리) */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}
