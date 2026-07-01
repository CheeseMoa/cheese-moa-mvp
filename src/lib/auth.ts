/**
 * 제작자(로그인) 액세스 토큰 저장 — 메모리 캐시 + localStorage.
 */

const ACCESS_TOKEN_KEY = 'cheesemoa.accessToken'

let cachedToken: string | null = null

export function getAccessToken(): string | null {
  if (cachedToken) return cachedToken
  try {
    cachedToken = localStorage.getItem(ACCESS_TOKEN_KEY)
  } catch {
    cachedToken = null
  }
  return cachedToken
}

export function setAccessToken(token: string): void {
  cachedToken = token
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
  } catch {
    /* localStorage 접근 불가(프라이빗 모드 등) — 메모리 캐시로 폴백 */
  }
}

export function clearAccessToken(): void {
  cachedToken = null
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
  } catch {
    /* noop */
  }
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null
}
