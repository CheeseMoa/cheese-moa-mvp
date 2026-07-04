import type { ApiError } from '../types/api'
import { clearAccessToken, getAccessToken } from './auth'
import { getViewerToken } from './viewer'

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
    // 제작자 토큰을 붙였는데 401 = 토큰 무효(옛 dev 토큰·재시드 등).
    // 지워 두면 가드·공개 화면 리다이렉트가 존재 검사만으로도 로그인 화면으로 복귀시킨다.
    if (res.status === 401 && auth === 'creator' && token) {
      clearAccessToken()
    }
    const err = (payload as ApiError | null)?.error
    throw new ApiRequestError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? res.statusText)
  }

  return payload as T
}
