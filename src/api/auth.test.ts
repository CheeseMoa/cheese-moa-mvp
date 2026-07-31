import { afterEach, describe, expect, it, vi } from 'vitest'
import { socialAuthorizeUrlForApp, socialCallbackPath } from './auth'

afterEach(() => {
  vi.unstubAllEnvs()
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
