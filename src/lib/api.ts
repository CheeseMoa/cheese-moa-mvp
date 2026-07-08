import type { ApiError } from '../types/api'
import { clearAccessToken, getAccessToken } from './auth'
import { clearViewerToken, getViewerToken } from './viewer'

/** docs/api-spec.md §1: Base URL */
export const API_BASE = '/api/v1'

/** API 오류(공통 에러 포맷 { error: { code, message } })를 감싼 예외 */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

/**
 * 표준 에러 포맷이 아닌 응답(code UNKNOWN)과 네트워크 실패(useApi가 감싼 NETWORK_ERROR 포함)는
 * 영어 statusText·"TypeError: Failed to fetch" 같은 원문이 새지 않게 일반 문구로.
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === 'NETWORK_ERROR') return '네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'
    if (err.code !== 'UNKNOWN' && err.message) return err.message
    return '요청에 실패했어요. 잠시 후 다시 시도해 주세요.'
  }
  return '네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'
}

/** react-router navigate와 구조적으로 호환되는 최소 타입 — lib이 라우터에 직접 의존하지 않게 */
type NavigateLike = (to: string, options?: { replace?: boolean; state?: unknown }) => void

/**
 * 뮤테이션 catch 공용: 401 = 토큰 무효(apiFetch가 이미 삭제 — 재시도는 영원히 실패)면
 * 재인증 화면으로 보내고 true를 반환한다. 호출부는 `if (redirectIfUnauthorized(err, navigate)) return`.
 * 뷰어 흐름은 `to`에 잠금 해제 경로를, 초대 흐름은 `state.returnTo`로 복귀 목적지를 넘긴다.
 */
export function redirectIfUnauthorized(
  err: unknown,
  navigate: NavigateLike,
  options: { to?: string; state?: unknown } = {},
): boolean {
  if (!(err instanceof ApiRequestError) || err.status !== 401) return false
  navigate(options.to ?? '/login', { replace: true, state: options.state })
  return true
}

type AuthMode = 'creator' | 'viewer' | 'none'

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  /** 첨부할 토큰 종류 (기본 creator) */
  auth?: AuthMode
  /** auth==='viewer'일 때 필요한 모임 공유 token */
  viewerShareToken?: string
  /** JSON 직렬화할 요청 본문 (객체를 넘기면 자동 stringify) */
  body?: unknown
}

/**
 * 공통 fetch 래퍼.
 * - JSON 요청/응답 처리, Authorization Bearer 자동 첨부
 * - 실패 시 ApiRequestError throw (공통 에러 포맷 파싱)
 */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = 'creator', viewerShareToken, body, headers, ...init } = options

  const finalHeaders = new Headers(headers)

  let serializedBody: BodyInit | undefined
  if (body !== undefined) {
    serializedBody = typeof body === 'string' ? body : JSON.stringify(body)
    if (!finalHeaders.has('Content-Type')) {
      finalHeaders.set('Content-Type', 'application/json')
    }
  }

  const token =
    auth === 'creator'
      ? getAccessToken()
      : auth === 'viewer' && viewerShareToken
        ? getViewerToken(viewerShareToken)
        : null
  if (token) {
    finalHeaders.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: finalHeaders,
    body: serializedBody,
  })

  if (res.status === 204) {
    return undefined as T
  }

  const isJson = res.headers.get('Content-Type')?.includes('application/json') ?? false
  const payload: unknown = isJson ? await res.json() : null

  if (!res.ok) {
    // 토큰을 붙였는데 401 = 토큰 무효(옛 dev 토큰·재시드 등). 지워 두면 가드·화면 리다이렉트가
    // 존재 검사만으로도 재인증 화면(로그인/뷰어 잠금 해제)으로 복귀시킨다.
    if (res.status === 401 && token) {
      if (auth === 'creator') clearAccessToken()
      else if (viewerShareToken) clearViewerToken(viewerShareToken)
    }
    const err = (payload as ApiError | null)?.error
    throw new ApiRequestError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? res.statusText)
  }

  return payload as T
}
