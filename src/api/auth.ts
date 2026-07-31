/**
 * 인증·프로필 엔드포인트 (CHMO-192·193) — 01·01-1·01-2 인증 화면, 설정 화면.
 * BE AuthResponse는 user 객체 없이 userId·nickname·accessToken·refreshToken 평면 필드로 온다 —
 * 두 토큰과 userId만 남긴다(userId는 온보딩 1회 판정용 계정 식별자 — CHMO-481). accessToken 401 자동 재발급(refresh)은 transport 인프라라
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
  userId: number
  accessToken: string
  refreshToken: string
}

/** 세 인증 엔드포인트가 같은 평면 응답을 준다 — 남길 필드 선택을 한곳에 둔다 */
function toAuthResponse(raw: RawAuthResponse): AuthResponse {
  return { userId: raw.userId, accessToken: raw.accessToken, refreshToken: raw.refreshToken }
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

/**
 * 앱(웹뷰) 경로에서 셸 브리지 `socialLogin`에 넘길 인가 시작 URL (CHMO-539).
 * 항상 실 BE 절대주소다 — socialLoginStartUrl과 달리 MSW 분기가 없다(앱 웹뷰는 실 BE 전용,
 * 목 모드는 호출부가 앱 경로 자체를 타지 않는다). `client=app`은 BE가 앱 발 요청을 식별해
 * 복귀 redirect를 커스텀 스킴 `cheesemoa://auth/callback`으로 바꾸는 표시 —
 * 계약·BE 협의 내용은 앱 리포 `CheeseMoa-App/docs/app-shell-spec.md` §2.5.
 */
export function socialAuthorizeUrlForApp(provider: SocialProvider): string {
  const origin = import.meta.env.VITE_API_ORIGIN ?? 'https://api.cheese-moa.com'
  return `${origin}/auth/social/${provider}?client=app`
}

/**
 * 셸이 돌려준 callbackUrl(전체 URL — `cheesemoa://auth/callback?code=…` 또는 `?error=…`)의
 * 쿼리를 FE 콜백 라우트에 그대로 태운다 — exchange·returnTo 복귀·에러 분기를 기존
 * SocialCallbackPage가 전부 재사용한다. 쿼리가 없으면 code 없는 진입 → 기존 실패 화면 수렴.
 */
export function socialCallbackPath(callbackUrl: string): string {
  const q = callbackUrl.indexOf('?')
  return q >= 0 ? `/auth/callback${callbackUrl.slice(q)}` : '/auth/callback'
}

/** POST /auth/social/exchange — 콜백 일회용 코드(TTL 60초)를 토큰 쌍으로 교환 (CHMO-359) */
export async function exchangeSocialCode(code: string): Promise<AuthResponse> {
  const raw = await apiFetch<RawAuthResponse>('/auth/social/exchange', {
    method: 'POST',
    auth: 'none',
    body: { code },
  })
  return toAuthResponse(raw)
}

/** POST /auth/login — 닉네임+PIN 로그인 */
export async function login(credentials: Credentials): Promise<AuthResponse> {
  const raw = await apiFetch<RawAuthResponse>('/auth/login', {
    method: 'POST',
    auth: 'none',
    body: credentials,
  })
  return toAuthResponse(raw)
}

/** POST /auth/signup — 계정 생성(성공 시 바로 로그인 상태) */
export async function signup(credentials: Credentials): Promise<AuthResponse> {
  const raw = await apiFetch<RawAuthResponse>('/auth/signup', {
    method: 'POST',
    auth: 'none',
    body: credentials,
  })
  return toAuthResponse(raw)
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

/**
 * DELETE /users/me — 계정 삭제(회원 탈퇴 — App Store 5.1.1(v), CHMO-526).
 * ⚠ 실 BE 미구현(CHMO-524 — 경로·파기 범위는 티켓 초안·목 선행, 배포 후 실계약 재확인):
 * 마지막 ACTIVE 선생님인 모임은 모임째 삭제, 그 외 모임은 멤버십만 정리, 동의 이력은 보존.
 * 성공 시 서버가 refreshToken을 전부 지운다 — 로컬 토큰 폐기(clearAuthTokens)는 호출부 몫.
 */
export async function deleteAccount(): Promise<void> {
  await apiFetch<unknown>('/users/me', { method: 'DELETE' })
}
