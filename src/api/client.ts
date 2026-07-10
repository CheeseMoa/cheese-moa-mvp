import { clearAuthTokens, getAccessToken, getRefreshToken, setAuthTokens } from '../lib/auth'
import { clearViewerToken, getViewerToken } from '../lib/viewer'
import { toFeErrorCode } from './errors'

/** docs/api-spec.md §1: Base URL (실 BE는 vite 프록시가 /api/v1을 벗겨 전달) */
export const API_BASE = '/api/v1'

/** API 오류를 감싼 예외 — code는 FE 의미 코드(errors.ts에서 정규화) */
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

// ── 응답 봉투 흡수 ───────────────────────────────────────────
// BE는 성공/실패 모두 { isSuccess, code, message, result } 봉투로 응답한다(MSW 목도 동일 — CHMO-195).
// 봉투는 여기서만 벗긴다 — 호출부는 언랩된 리소스만 본다. (CHMO-191)

interface BeEnvelope {
  isSuccess: boolean
  code: string
  message: string
  result?: unknown
}

function isBeEnvelope(payload: unknown): payload is BeEnvelope {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as BeEnvelope).isSuccess === 'boolean' &&
    typeof (payload as BeEnvelope).code === 'string'
  )
}

/**
 * BE `createdAt`이 `2026-07-09T04:13:46.842202`처럼 오프셋 없는 UTC로 내려와
 * 브라우저가 로컬(KST)로 읽으면 9시간 밀린다. BE 수정(CHMO-205) 전까지 'Z'를 붙여 방어.
 * 오프셋이 이미 있는 시각(MSW 픽스처의 +09:00)은 손대지 않는다.
 */
const OFFSETLESS_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/

function normalizeTimestamps(value: unknown): unknown {
  if (typeof value === 'string') {
    return OFFSETLESS_DATETIME_RE.test(value) ? `${value}Z` : value
  }
  if (Array.isArray(value)) return value.map(normalizeTimestamps)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeTimestamps(entry)]),
    )
  }
  return value
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

// ── accessToken 자동 재발급 (CHMO-193) ───────────────────────
// accessToken은 만료 1시간이라 401이 흔하다. 제작자 요청이 401을 받으면 refreshToken으로
// 새 토큰 쌍을 받아 원 요청을 1회 재시도한다 — 사용자는 로그아웃되지 않는다.
// /auth/refresh 경로는 화면이 부르지 않는 transport 인프라라 도메인(auth.ts)이 아닌 여기가
// 소유한다. 재발급 자체는 auth:'none'으로 보내(제작자 토큰 미첨부) 인터셉터가 자기 자신에
// 재귀하지 않게 한다.

interface RawAuthTokens {
  accessToken: string
  refreshToken: string
}

/** 동시에 여러 요청이 401을 받아도 재발급은 한 번만 — 진행 중 promise를 공유한다 */
let refreshInFlight: Promise<boolean> | null = null

function refreshAccessTokenOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = requestFreshTokens().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/** refreshToken으로 새 토큰 쌍을 받아 저장. 성공 여부만 반환(토큰 정리는 호출부). */
async function requestFreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  try {
    const tokens = await apiFetch<RawAuthTokens>('/auth/refresh', {
      method: 'POST',
      auth: 'none',
      body: { refreshToken },
    })
    setAuthTokens(tokens)
    return true
  } catch {
    // refreshToken까지 만료/무효(TOKEN401 등) — 세션 종료. 정리·리다이렉트는 재시도 실패 경로에서.
    return false
  }
}

/**
 * 공통 fetch 래퍼.
 * - JSON 요청/응답 처리, Authorization Bearer 자동 첨부
 * - 응답 봉투는 result 언랩 + 에러 코드 정규화 + 시각 보정
 * - 제작자 401 시 accessToken 1회 재발급 후 재시도(CHMO-193)
 * - 실패 시 ApiRequestError throw
 */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  return sendRequest<T>(path, options, true)
}

/**
 * @param allowRefresh 401 시 accessToken 재발급을 시도할지 — 재발급 후 재시도 호출은 false로
 *   넘겨 무한 재발급 루프를 막는다(1회 한정).
 */
async function sendRequest<T>(
  path: string,
  options: ApiOptions,
  allowRefresh: boolean,
): Promise<T> {
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

  // 제작자 토큰을 붙였는데 401 = accessToken 만료/무효.
  if (res.status === 401 && auth === 'creator' && token) {
    // 1회 한정 재발급 후 새 토큰으로 원 요청 재시도 — 성공하면 사용자는 로그아웃되지 않는다.
    if (allowRefresh && (await refreshAccessTokenOnce())) {
      return sendRequest<T>(path, options, false)
    }
    // 재발급 불가/실패(또는 재시도도 401) = 세션 종료. 두 토큰을 지워 가드·화면이 로그인으로 복귀시킨다.
    clearAuthTokens()
  } else if (res.status === 401 && auth === 'viewer' && viewerShareToken) {
    // 뷰어 토큰은 재발급 대상이 아니다 — 지우면 존재 검사만으로 잠금 해제 화면으로 복귀(만료 1일).
    clearViewerToken(viewerShareToken)
  }

  if (res.status === 204) {
    return undefined as T
  }

  const isJson = res.headers.get('Content-Type')?.includes('application/json') ?? false
  const payload: unknown = isJson ? await res.json() : null

  if (isBeEnvelope(payload)) {
    if (!res.ok || !payload.isSuccess) {
      throw new ApiRequestError(res.status, toFeErrorCode(payload.code), payload.message)
    }
    return normalizeTimestamps(payload.result) as T
  }

  // 봉투가 아닌 응답 = API가 아닌 무언가(프록시 오류 페이지 등). 원문이 사용자에게 새지 않게 UNKNOWN.
  if (!res.ok) {
    throw new ApiRequestError(res.status, 'UNKNOWN', res.statusText)
  }

  return payload as T
}
