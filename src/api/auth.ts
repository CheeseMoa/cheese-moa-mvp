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

export type SocialProvider = 'kakao' | 'google' | 'naver' | 'apple'

/**
 * 소셜 로그인 시작 URL (CHMO-359) — fetch가 아니라 브라우저 전체 이동(window.location) 대상.
 * 실 BE: API 오리진으로 직접 이동 → BE가 프로바이더 인가 페이지로 302 → 프로바이더가 BE 콜백으로
 * 복귀 → BE가 FE `/auth/callback?code=일회용코드`로 302. vite 프록시(/api/v1)를 태우지 않는 이유:
 * 문서 이동은 CORS가 없어 프록시가 불필요하고, 오리진을 바꾸면 BE의 state 쿠키가 콜백에서 유실된다.
 * MSW 목 모드: 서비스워커는 문서 내비게이션 요청을 가로채지 못하므로 외부 왕복(프로바이더·BE 콜백)을
 * 건너뛰고 콜백 라우트로 직행한다 — exchange 계약은 목 핸들러가 검증한다.
 * 목 코드에 매번 다른 꼬리를 붙이는 이유: 실 BE의 코드는 1회 소진이라 목도 그렇게 흉내 내는데,
 * 고정 문자열이면 두 번째 로그인이 "재사용"으로 막힌다.
 */
export function socialLoginStartUrl(provider: SocialProvider): string {
  if (import.meta.env.VITE_ENABLE_MSW === 'true') {
    return `/auth/callback?code=mock-social-${provider}-${crypto.randomUUID()}`
  }
  const origin = import.meta.env.VITE_API_ORIGIN ?? 'https://api.cheese-moa.com'
  return `${origin}/auth/social/${provider}`
}

/** POST /auth/social/exchange — 콜백 일회용 코드(TTL 60초)를 토큰 쌍으로 교환 (CHMO-359) */
export async function exchangeSocialCode(code: string): Promise<AuthResponse> {
  const raw = await apiFetch<RawAuthResponse>('/auth/social/exchange', {
    method: 'POST',
    auth: 'none',
    body: { code },
  })
  return { accessToken: raw.accessToken, refreshToken: raw.refreshToken }
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
