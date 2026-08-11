import { afterEach, describe, expect, it, vi } from 'vitest'
import { socialAuthorizeUrlForApp, socialCallbackPath, socialLoginStartUrl } from './auth'
import { MOCK_USERS_STORAGE_KEY } from '../lib/mockSocial'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('socialLoginStartUrl 가입 유예 마커 (CHMO-602)', () => {
  // 실 BE는 미가입 소셜 신원이면 콜백에 signup=true를 싣는다 — 목 URL 생성이 같은 계약을 탄다.
  // 판정 원천은 persist 가입 계정 보존소(localStorage) — 별도 플래그가 아니라 계정 존재 그 자체
  it('목 계정이 없는 프로바이더는 signup=true를 싣는다', () => {
    vi.stubEnv('VITE_ENABLE_MSW', 'true')
    const url = socialLoginStartUrl('kakao')
    expect(url).toMatch(/^\/auth\/callback\?code=mock-social-kakao-/)
    expect(url).toContain('&signup=true')
  })

  it('가입된 프로바이더(보존소에 목 계정)는 마커 없이 로그인 코드만', () => {
    vi.stubEnv('VITE_ENABLE_MSW', 'true')
    localStorage.setItem(
      MOCK_USERS_STORAGE_KEY,
      JSON.stringify([{ id: 1001, nickname: '카카오테스트', pin: '', role: 'USER' }]),
    )
    expect(socialLoginStartUrl('kakao')).not.toContain('signup')
    // 다른 프로바이더는 여전히 신규 — 판정이 프로바이더 단위임을 고정
    expect(socialLoginStartUrl('google')).toContain('&signup=true')
  })
})

describe('socialAuthorizeUrlForApp (CHMO-539)', () => {
  it('실 BE 절대주소 + client=app 표시 — MSW 분기가 없다', () => {
    vi.stubEnv('VITE_API_ORIGIN', 'https://api.example.com')
    vi.stubEnv('VITE_ENABLE_MSW', 'true') // 목 모드여도 앱 인가 URL은 실 주소여야 한다
    expect(socialAuthorizeUrlForApp('kakao')).toBe(
      'https://api.example.com/auth/social/kakao?client=app',
    )
  })
})

describe('socialCallbackPath (CHMO-539)', () => {
  it('셸 callbackUrl(커스텀 스킴)의 쿼리를 콜백 라우트에 그대로 태운다', () => {
    expect(socialCallbackPath('cheesemoa://auth/callback?code=abc123')).toBe(
      '/auth/callback?code=abc123',
    )
  })

  it('실패 복귀(?error=…)도 그대로 — 기존 에러 분기 재사용', () => {
    expect(socialCallbackPath('cheesemoa://auth/callback?error=OAUTH401')).toBe(
      '/auth/callback?error=OAUTH401',
    )
  })

  it('쿼리가 없으면 code 없는 진입으로 수렴(기존 실패 화면)', () => {
    expect(socialCallbackPath('cheesemoa://auth/callback')).toBe('/auth/callback')
  })
})
