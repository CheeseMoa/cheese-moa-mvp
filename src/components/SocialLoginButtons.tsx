import { useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { setSocialReturnTo } from '../lib/auth'
import {
  socialAuthorizeUrlForApp,
  socialCallbackPath,
  socialLoginStartUrl,
  type SocialProvider,
} from '../api/auth'
import { BridgeError, hasCapability, socialLogin } from '../native/bridge'
import { isSocialProviderVisible } from '../lib/socialProviders'

/** 프로바이더별 브랜드 규격 — 색은 각 사 디자인 가이드 고정값이라 디자인 토큰을 쓰지 않는다 */
const PROVIDERS: Array<{
  provider: SocialProvider
  label: string
  className: string
  icon: ReactNode
}> = [
  {
    provider: 'kakao',
    label: '카카오로 시작하기',
    className: 'bg-[#FEE500] text-[#191919]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.25 4.64 6.64l-.94 3.46c-.08.3.26.55.53.38l4.06-2.7c.56.08 1.13.12 1.71.12 5.52 0 10-3.54 10-7.9S17.52 3 12 3z" />
      </svg>
    ),
  },
  {
    provider: 'google',
    label: 'Google로 시작하기',
    className: 'border border-border bg-white text-[#1F1F1F]',
    icon: (
      <svg viewBox="0 0 18 18" className="h-5 w-5" aria-hidden>
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
        />
      </svg>
    ),
  },
  {
    provider: 'naver',
    label: '네이버로 시작하기',
    className: 'bg-[#03C75A] text-white',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M16.27 12.85 7.42 0H0v24h7.73V11.15L16.58 24H24V0h-7.73v12.85z" />
      </svg>
    ),
  },
  {
    provider: 'apple',
    label: 'Apple로 시작하기',
    className: 'bg-black text-white',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    ),
  },
]

interface SocialLoginButtonsProps {
  /** 로그인에 가로막혀 온 경우(초대 링크 등)의 복귀 목적지 — 외부 리다이렉트 전에 세션에 맡긴다 */
  returnTo?: string
}

/**
 * 소셜 로그인 버튼 4종 (CHMO-359) — 01 랜딩 · 01-1/01-2 폼 공용.
 * 브라우저: 전체 이동이다 — BE `/auth/social/{provider}` → 프로바이더 인가 → BE 콜백 →
 * FE `/auth/callback`으로 돌아온다.
 * 앱 웹뷰(CHMO-539): 구글이 웹뷰 내 OAuth를 차단하므로 브리지 `socialLogin`으로 시스템
 * 인증 세션에서 왕복하고, 셸이 돌려준 callbackUrl의 쿼리를 SPA 내부 이동으로 기존
 * `/auth/callback` 처리에 태운다 — exchange·returnTo 복귀·에러 분기 전부 재사용.
 * Android 앱 웹뷰는 Apple 버튼을 숨긴다(CHMO-551 — 규칙은 `lib/socialProviders`).
 */
export function SocialLoginButtons({ returnTo }: SocialLoginButtonsProps) {
  const navigate = useNavigate()
  // 인증 세션이 뜨기 전 찰나에 다른 버튼을 또 누르면 세션이 겹친다 — 재진입 가드
  const inFlight = useRef(false)

  const start = async (provider: SocialProvider) => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      if (returnTo) setSocialReturnTo(returnTo)
      // MSW 목 모드는 브라우저 전용(문서 이동으로 목 콜백 직행) — 앱 경로를 타지 않는다
      if (import.meta.env.VITE_ENABLE_MSW !== 'true' && (await hasCapability('socialLogin'))) {
        await startInApp(provider)
        return
      }
      window.location.assign(socialLoginStartUrl(provider))
    } finally {
      inFlight.current = false
    }
  }

  /** 세션 취소(CANCELLED)는 무토스트로 제자리 — 그 외 실패는 기존 콜백 에러 화면으로 수렴 */
  const startInApp = async (provider: SocialProvider) => {
    try {
      const { callbackUrl } = await socialLogin({
        provider,
        authorizeUrl: socialAuthorizeUrlForApp(provider),
      })
      navigate(socialCallbackPath(callbackUrl))
    } catch (err) {
      if (err instanceof BridgeError && err.code === 'CANCELLED') return
      // 미지 코드는 SocialCallbackPage가 일반 실패 문구(재시도 안내)로 수렴시킨다
      navigate('/auth/callback?error=APP_BRIDGE')
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {PROVIDERS.filter(({ provider }) => isSocialProviderVisible(provider)).map(
        ({ provider, label, className, icon }) => (
          <button
            key={provider}
            type="button"
            onClick={() => void start(provider)}
            className={`flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-[15px] font-semibold transition active:scale-[0.98] ${className}`}
          >
            {icon}
            {label}
          </button>
        ),
      )}
    </div>
  )
}
