/**
 * 인증·프로필 엔드포인트 (CHMO-192·193) — 01·01-1·01-2 인증 화면, 설정 화면.
 * BE AuthResponse는 user 객체 없이 userId·nickname·accessToken·refreshToken 평면 필드로 온다 —
 * 두 토큰과 userId만 남긴다(userId는 온보딩 1회 판정용 계정 식별자 — CHMO-481). accessToken 401 자동 재발급(refresh)은 transport 인프라라
 * client.ts가 소유한다(화면이 호출하지 않는 유일한 auth 엔드포인트).
 */
import { apiFetch } from './client'
import { toUser, type RawUser } from './mappers'
import { SIGNUP_AGREEMENT_ITEMS } from '../legal/signupAgreements'
import { isMockSocialRegistered } from '../lib/mockSocial'
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
 * `signup=true`(가입 유예 — CHMO-602): 실 BE는 미가입 소셜 신원이면 계정을 만들지 않고 이
 * 마커를 실어 보낸다. 목은 그 프로바이더의 목 계정 존재 여부(persist 보존소)로 같은 판정을 한다.
 */
export function socialLoginStartUrl(provider: SocialProvider): string {
  if (import.meta.env.VITE_ENABLE_MSW === 'true') {
    const signup = isMockSocialRegistered(provider) ? '' : '&signup=true'
    return `/auth/callback?code=mock-social-${provider}-${crypto.randomUUID()}${signup}`
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

/**
 * POST /auth/social/exchange — 신규 가입(콜백 `signup=true`, CHMO-602 · BE CHMO-598의 소셜판).
 * 콜백에서 계정이 생성되지 않고 이 호출이 곧 가입이라, 가입과 필수 동의 기록이 한 트랜잭션이
 * 되도록 `agreements`를 동봉한다 — signup()과 같은 이유·같은 원천(가입 전이라 토큰이 없어
 * 서버 카탈로그를 못 읽으므로 버전은 FE 문구, CHMO-517)이고 MARKETING도 같은 결정으로 싣지
 * 않는다(정본 §1.1 — 화면에 그리지 않는 항목의 거부 기록을 만들지 않는다).
 * 호출 전 동의 수집(01-C 인라인 동의 폼)이 먼저다 — 필수 미동의·버전 불일치는 VALID400이고
 * 이때 코드는 소비되지 않아 같은 화면에서 재시도할 수 있다. 가입 대기 코드의 TTL은 10분 —
 * 만료·재사용은 OAUTH401이라 재로그인부터다.
 */
export async function exchangeSocialSignup(code: string): Promise<AuthResponse> {
  const raw = await apiFetch<RawAuthResponse>('/auth/social/exchange', {
    method: 'POST',
    auth: 'none',
    body: {
      code,
      agreements: SIGNUP_AGREEMENT_ITEMS.map((item) => ({
        type: item.type.toUpperCase(),
        version: item.version,
        agreed: true,
      })),
    },
  })
  return toAuthResponse(raw)
}

/** POST /auth/login — 닉네임+PIN 로그인. 소셜 단일화(CHMO-557) 후 호출부는 DEV 전용 /dev/login뿐 */
export async function login(credentials: Credentials): Promise<AuthResponse> {
  const raw = await apiFetch<RawAuthResponse>('/auth/login', {
    method: 'POST',
    auth: 'none',
    body: credentials,
  })
  return toAuthResponse(raw)
}

/**
 * POST /auth/signup — 계정 생성(성공 시 바로 로그인 상태). 가입과 필수 동의 기록이 한 트랜잭션이라
 * `agreements` 동봉이 필수다(BE CHMO-598 — 없으면 VALID400. 가입 후 별도 제출이면 그 사이 앱 종료
 * 시 동의 없는 계정이 남는다). 가입 전이라 토큰이 없어 `GET /agreements`를 못 부르므로 항목·버전의
 * 원천은 FE 문구(SIGNUP_AGREEMENT_ITEMS — CHMO-517)이고, 필수 4종을 전부 agreed:true로 싣는다.
 * MARKETING은 싣지 않는다 — 화면에 그리지 않는 항목의 거부 기록을 만들지 않는다(정본 §1.1,
 * BE 완전성 검증은 필수 항목만 본다).
 * 화면 호출부 없음(CHMO-557 — 01-2 삭제) · BE 엔드포인트가 살아 있어 계약 테스트 고정용으로 잔존
 * (CHMO-473 zip 전례). 가입 화면이 부활하면 이 호출 전에 체크 수집이 먼저다(01-A 관용).
 */
export async function signup(credentials: Credentials): Promise<AuthResponse> {
  const raw = await apiFetch<RawAuthResponse>('/auth/signup', {
    method: 'POST',
    auth: 'none',
    body: {
      ...credentials,
      agreements: SIGNUP_AGREEMENT_ITEMS.map((item) => ({
        type: item.type.toUpperCase(),
        version: item.version,
        agreed: true,
      })),
    },
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
 * DELETE /me — 계정 삭제(회원 탈퇴 — App Store 5.1.1(v), CHMO-526 · 실계약 정합 CHMO-575).
 * 경로는 GET/PATCH /me 관례를 따른 실 BE 확정값(CHMO-524 PR #166 — 티켓 초안 /users/me 폐기).
 * 파기 범위(ADR 019): 마지막 ACTIVE 선생님인 모임은 모임째 삭제, 그 외 모임은 멤버십만 정리,
 * 동의 이력은 보존. 분석 중 이벤트가 있어도 막히지 않는다(모임 나가기 MOMENT409와 다른 점).
 * 성공 시 서버가 refreshToken을 전부 지운다 — 로컬 토큰 폐기(clearAuthTokens)는 호출부 몫.
 */
export async function deleteAccount(): Promise<void> {
  await apiFetch<unknown>('/me', { method: 'DELETE' })
}
