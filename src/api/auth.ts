/**
 * 인증·프로필 엔드포인트 (CHMO-192) — 01·01-1·01-2 인증 화면, 설정 화면.
 * BE AuthResponse는 user 객체 없이 userId·nickname·refreshToken 평면 필드로 온다 —
 * 화면이 쓰는 accessToken만 남긴다(refreshToken 저장은 CHMO-193).
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
}

/** POST /auth/login — 닉네임+PIN 로그인 */
export async function login(credentials: Credentials): Promise<AuthResponse> {
  const raw = await apiFetch<RawAuthResponse>('/auth/login', {
    method: 'POST',
    auth: 'none',
    body: credentials,
  })
  return { accessToken: raw.accessToken }
}

/** POST /auth/signup — 계정 생성(성공 시 바로 로그인 상태) */
export async function signup(credentials: Credentials): Promise<AuthResponse> {
  const raw = await apiFetch<RawAuthResponse>('/auth/signup', {
    method: 'POST',
    auth: 'none',
    body: credentials,
  })
  return { accessToken: raw.accessToken }
}

/** GET /me — 내 프로필 */
export function getMe(signal?: AbortSignal): Promise<User> {
  return apiFetch<RawUser>('/me', { signal }).then(toUser)
}

/** PATCH /me — pin은 undefined면 요청 본문에서 빠진다(JSON.stringify가 생략) */
export function updateMe(input: { nickname: string; pin?: string }): Promise<User> {
  return apiFetch<RawUser>('/me', { method: 'PATCH', body: input }).then(toUser)
}
