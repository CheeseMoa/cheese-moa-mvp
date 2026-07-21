/**
 * 제작자(로그인) 토큰 저장 — 메모리 캐시 + localStorage.
 * accessToken(만료 1시간)과 refreshToken(재발급용, CHMO-193)을 함께 관리한다 —
 * 로그인/회원가입/재발급 성공 시 함께 저장, 로그아웃/세션 만료 시 함께 삭제한다.
 */

const ACCESS_TOKEN_KEY = 'cheesemoa.accessToken'
const REFRESH_TOKEN_KEY = 'cheesemoa.refreshToken'

let cachedAccessToken: string | null = null
let cachedRefreshToken: string | null = null

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* localStorage 접근 불가(프라이빗 모드 등) — 메모리 캐시로 폴백 */
  }
}

function removeStored(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

export function getAccessToken(): string | null {
  if (cachedAccessToken) return cachedAccessToken
  cachedAccessToken = readStored(ACCESS_TOKEN_KEY)
  return cachedAccessToken
}

export function setAccessToken(token: string): void {
  cachedAccessToken = token
  writeStored(ACCESS_TOKEN_KEY, token)
}

export function clearAccessToken(): void {
  cachedAccessToken = null
  removeStored(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  if (cachedRefreshToken) return cachedRefreshToken
  cachedRefreshToken = readStored(REFRESH_TOKEN_KEY)
  return cachedRefreshToken
}

export function setRefreshToken(token: string): void {
  cachedRefreshToken = token
  writeStored(REFRESH_TOKEN_KEY, token)
}

export function clearRefreshToken(): void {
  cachedRefreshToken = null
  removeStored(REFRESH_TOKEN_KEY)
}

/** 로그인/회원가입/토큰 재발급 성공 시 두 토큰을 함께 저장 */
export function setAuthTokens(tokens: { accessToken: string; refreshToken: string }): void {
  setAccessToken(tokens.accessToken)
  setRefreshToken(tokens.refreshToken)
}

/** 로그아웃/세션 만료(refresh 실패) 시 두 토큰을 함께 삭제 */
export function clearAuthTokens(): void {
  clearAccessToken()
  clearRefreshToken()
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null
}

// ── 소셜 로그인 복귀 목적지 (CHMO-359) ────────────────────────
// 소셜 로그인은 외부 리다이렉트로 페이지를 떠나므로 router state로 returnTo를 전달할 수 없다 —
// 떠나기 전 sessionStorage에 맡겼다가 콜백(/auth/callback)에서 꺼낸다. 새 로그인 흐름이 이전
// 값에 오염되지 않게 읽는 쪽에서 소비(삭제)한다.

const SOCIAL_RETURN_TO_KEY = 'cheesemoa.socialReturnTo'

export function setSocialReturnTo(returnTo: string): void {
  try {
    sessionStorage.setItem(SOCIAL_RETURN_TO_KEY, returnTo)
  } catch {
    /* sessionStorage 접근 불가 — returnTo 없이 홈으로 복귀(로그인 자체는 진행) */
  }
}

export function consumeSocialReturnTo(): string | null {
  try {
    const value = sessionStorage.getItem(SOCIAL_RETURN_TO_KEY)
    sessionStorage.removeItem(SOCIAL_RETURN_TO_KEY)
    return value
  } catch {
    return null
  }
}
