/**
 * 인증·프로필 엔드포인트 (CHMO-192·193) — 01·01-1·01-2 인증 화면, 설정 화면.
 * BE AuthResponse는 user 객체 없이 userId·nickname·accessToken·refreshToken 평면 필드로 온다 —
 * 화면이 쓰는 두 토큰만 남긴다. accessToken 401 자동 재발급(refresh)은 transport 인프라라
 * client.ts가 소유한다(화면이 호출하지 않는 유일한 auth 엔드포인트).
 */
import { apiFetch } from './client'
import { toUser, type RawUser } from './mappers'
import type { AuthResponse, User } from '../types/api'

export interface Credentials {
  nickname: string
  pin: string
}

interface RawAuthResponse {
  accessToken: string
  refreshToken: string
}

/** POST /auth/login — 닉네임+PIN 로그인 */
export async function login(credentials: Credentials): Promise<AuthResponse> {
  const raw = await apiFetch<RawAuthResponse>('/auth/login', {
    method: 'POST',
    auth: 'none',
    body: credentials,
  })
  return { accessToken: raw.accessToken, refreshToken: raw.refreshToken }
}

/** POST /auth/signup — 계정 생성(성공 시 바로 로그인 상태) */
export async function signup(credentials: Credentials): Promise<AuthResponse> {
  const raw = await apiFetch<RawAuthResponse>('/auth/signup', {
    method: 'POST',
    auth: 'none',
    body: credentials,
  })
  return { accessToken: raw.accessToken, refreshToken: raw.refreshToken }
}

/**
 * POST /auth/logout — 서버에서 refreshToken 무효화(BE LogoutRequest = { refreshToken }).
 * accessToken은 붙이지 않는다(auth:'none') — refreshToken이 무효화 대상 세션의 키이고,
 * 만료된 accessToken 때문에 재발급 인터셉터가 끼어드는 걸 막는다. 로컬 토큰 삭제는
 * 호출부(SettingsPage) 몫이며, 이 호출이 실패해도 로컬 로그아웃은 진행한다.
 */
export async function logout(refreshToken: string): Promise<void> {
  await apiFetch<void>('/auth/logout', {
    method: 'POST',
    auth: 'none',
    body: { refreshToken },
  })
}

/** GET /me — 내 프로필 */
export function getMe(signal?: AbortSignal): Promise<User> {
  return apiFetch<RawUser>('/me', { signal }).then(toUser)
}

/** PATCH /me — pin은 undefined면 요청 본문에서 빠진다(JSON.stringify가 생략) */
export function updateMe(input: { nickname: string; pin?: string }): Promise<User> {
  return apiFetch<RawUser>('/me', { method: 'PATCH', body: input }).then(toUser)
}
