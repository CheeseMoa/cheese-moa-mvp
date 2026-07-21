import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { BrandHero } from '../components/BrandHero'
import { ButtonLink } from '../components/ui'
import { useMutation } from '../hooks/useMutation'
import { exchangeSocialCode } from '../api/auth'
import { toFeErrorCode } from '../api/errors'
import { consumeSocialReturnTo, setAuthTokens } from '../lib/auth'

/**
 * BE 콜백이 `?error=`로 싣는 코드별 안내 — 사용자가 취할 행동이 서로 다르다
 * (다른 방법으로 로그인 / 그냥 재시도 / 시간을 두고 재시도).
 */
const SOCIAL_ERROR_MESSAGES: Record<string, string> = {
  UNSUPPORTED_SOCIAL_PROVIDER: '아직 준비되지 않은 로그인 방법이에요. 다른 방법으로 로그인해 주세요.',
  SOCIAL_AUTH_FAILED: '소셜 로그인에 실패했어요. 다시 시도해 주세요.',
  SOCIAL_PROVIDER_ERROR: '로그인 서비스와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
}

/** 미지의 코드·코드 없음(직접 진입)은 재시도 안내로 수렴시킨다 */
function socialErrorMessage(beCode: string | null): string {
  const mapped = beCode ? SOCIAL_ERROR_MESSAGES[toFeErrorCode(beCode)] : undefined
  return mapped ?? SOCIAL_ERROR_MESSAGES.SOCIAL_AUTH_FAILED
}

/**
 * 01-C. 소셜 로그인 콜백 (CHMO-359) — BE가 인가 완료 후 `?code=일회용코드`(TTL 60초) 또는
 * `?error=OAUTH400|OAUTH401|OAUTH502|COMMON500`을 실어 리다이렉트한다.
 * code는 즉시 토큰 쌍으로 교환하고 원 목적지로 복귀.
 */
export function SocialCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const mutate = useMutation()
  const code = params.get('code')
  // code 없이 들어온 경우(직접 진입·파라미터 유실)도 인가 실패와 같은 화면으로 다룬다
  const redirectError = params.get('error') !== null || !code ? socialErrorMessage(params.get('error')) : null
  const [exchangeError, setExchangeError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // 일회용 코드는 재사용이 401이라 StrictMode 이중 실행을 가드한다
    if (!code || started.current) return
    started.current = true
    void mutate(() => exchangeSocialCode(code), {
      // 교환 실패 401은 세션 만료가 아니라 이 화면의 결과 — 리다이렉트 대신 에러 표시
      noAuthRedirect: true,
      onSuccess: (tokens) => {
        setAuthTokens(tokens)
        navigate(consumeSocialReturnTo() ?? '/home', { replace: true })
      },
      onError: setExchangeError,
    })
  }, [code, mutate, navigate])

  const errorMessage = redirectError ?? exchangeError

  return (
    <PhoneShell>
      <div className="flex flex-1 flex-col justify-center">
        <BrandHero />
        <div className="px-5 text-center">
          {errorMessage ? (
            <>
              <p role="alert" className="text-sm text-warn">
                {errorMessage}
              </p>
              <div className="mt-6">
                <ButtonLink to="/login" fullWidth>
                  다시 로그인
                </ButtonLink>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">로그인 처리 중…</p>
          )}
        </div>
      </div>
    </PhoneShell>
  )
}
