import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { BrandHero } from '../components/BrandHero'
import { SignupConsentForm } from '../components/SignupConsentForm'
import { ButtonLink } from '../components/ui'
import { useMutation } from '../hooks/useMutation'
import { exchangeSocialCode, exchangeSocialSignup } from '../api/auth'
import { listAgreements } from '../api/agreements'
import { ApiRequestError } from '../api/client'
import { toFeErrorCode } from '../api/errors'
import { consumeSocialReturnTo, setAuthTokens, setCurrentUserId } from '../lib/auth'
import { evaluateConsentGate } from '../lib/consentGate'
import { postLoginDestination } from '../lib/onboarding'
import type { AuthResponse } from '../types/api'

/**
 * BE 콜백이 `?error=`로 싣는 코드별 안내 — 사용자가 취할 행동이 서로 다르다
 * (다른 방법으로 로그인 / 그냥 재시도 / 시간을 두고 재시도).
 */
const SOCIAL_ERROR_MESSAGES: Record<string, string> = {
  UNSUPPORTED_SOCIAL_PROVIDER: '지원하지 않는 로그인 방법이에요. 다른 방법으로 로그인해 주세요.',
  SOCIAL_AUTH_FAILED: '소셜 로그인에 실패했어요. 다시 시도해 주세요.',
  SOCIAL_PROVIDER_ERROR: '로그인 서비스와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
}

/** 미지의 코드·코드 없음(직접 진입)은 재시도 안내로 수렴시킨다 */
function socialErrorMessage(beCode: string | null): string {
  const mapped = beCode ? SOCIAL_ERROR_MESSAGES[toFeErrorCode(beCode)] : undefined
  return mapped ?? SOCIAL_ERROR_MESSAGES.SOCIAL_AUTH_FAILED
}

/** 토큰 저장 + 원 목적지 산출 — 로그인·가입 두 갈래의 공통 후속 */
function completeLogin(tokens: AuthResponse): string {
  setAuthTokens(tokens)
  // 온보딩 완료 플래그가 계정별이라 판정보다 먼저 저장한다(CHMO-481)
  setCurrentUserId(tokens.userId)
  return postLoginDestination(consumeSocialReturnTo())
}

/**
 * 01-C. 소셜 로그인 콜백 (CHMO-359) — BE가 인가 완료 후 `?code=일회용코드`(TTL 60초) 또는
 * `?error=OAUTH400|OAUTH401|OAUTH502|COMMON500`을 실어 리다이렉트한다.
 * code는 즉시 토큰 쌍으로 교환하고 원 목적지로 복귀.
 *
 * 가입 유예(CHMO-602 · BE CHMO-598의 소셜판): 미가입 소셜 신원이면 BE가 계정을 만들지 않고
 * `&signup=true`(가입 대기 코드, TTL 10분)를 실어 보낸다 — exchange 전에 이 화면이 가입 동의
 * 폼(01-A와 공용)을 먼저 그리고, 동의 완료 시 exchangeSocialSignup이 동의를 동봉해 그때
 * 가입된다. "동의 없이 계정이 만들어지는 경로"가 구조적으로 없다. 새로고침해도 code·signup이
 * URL에 남고 코드는 아직 미소진이라 폼이 그대로 다시 선다.
 */
export function SocialCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const mutate = useMutation()
  const code = params.get('code')
  const isSignup = params.get('signup') === 'true'
  // code 없이 들어온 경우(직접 진입·파라미터 유실)도 인가 실패와 같은 화면으로 다룬다
  const redirectError = params.get('error') !== null || !code ? socialErrorMessage(params.get('error')) : null
  const [exchangeError, setExchangeError] = useState<string | null>(null)
  // 가입 분기의 제출 실패(VALID400 등 — 코드 미소진) — 폼을 유지한 채 알린다
  const [consentError, setConsentError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    // 가입 분기(signup=true)는 동의 수집이 먼저라 여기서 교환하지 않는다(제출 버튼이 시작점)
    if (!code || isSignup || started.current) return
    // 일회용 코드는 재사용이 401이라 StrictMode 이중 실행을 가드한다
    started.current = true
    void mutate(() => exchangeSocialCode(code), {
      // 교환 실패 401은 세션 만료가 아니라 이 화면의 결과 — 리다이렉트 대신 에러 표시
      noAuthRedirect: true,
      onSuccess: async (tokens) => {
        const dest = completeLogin(tokens)
        // 가입 동의 게이트(CHMO-479) — 기존 계정도 기록이 없거나 문구가 개정됐으면 01-A를
        // 거친다(신규 가입은 이제 이 경로에 오지 않는다 — 가입 분기가 동의를 동봉). 조회 실패는
        // 통과 — 게이트는 FE 몫이고(서버 강제는 CHMO-519 후속) 곁가지 조회가 로그인을 막지 않는다.
        const gate = await listAgreements().then(evaluateConsentGate).catch(() => 'pass' as const)
        if (gate === 'pass') navigate(dest, { replace: true })
        else navigate('/consent', { replace: true, state: { returnTo: dest } })
      },
      onError: setExchangeError,
    })
  }, [code, isSignup, mutate, navigate])

  const handleConsentSubmit = async () => {
    if (!code || submitting) return
    setSubmitting(true)
    setConsentError(null)
    await mutate(() => exchangeSocialSignup(code), {
      noAuthRedirect: true,
      onSuccess: (tokens) => {
        // 가입과 동의 기록이 한 트랜잭션(BE) — 방금 낸 동의를 01-A 게이트로 되묻지 않는다
        navigate(completeLogin(tokens), { replace: true })
      },
      onError: (msg, err) => {
        if (err instanceof ApiRequestError && err.code === 'SOCIAL_AUTH_FAILED') {
          // OAUTH401 = 가입 대기 코드 만료(TTL 10분)·소진 — 재시도가 무의미하니 재로그인부터
          setExchangeError('가입 유효 시간이 지났어요. 다시 로그인해 주세요.')
        } else {
          // VALID400(필수 미동의·버전 불일치 등) — 코드가 소비되지 않아 이 폼에서 재시도 가능
          setConsentError(msg)
        }
        setSubmitting(false)
      },
    })
  }

  const errorMessage = redirectError ?? exchangeError

  // 가입 분기 — exchange 전에 동의부터(에러가 나면 아래 공통 에러 화면이 이긴다)
  if (!errorMessage && isSignup) {
    return (
      <PhoneShell>
        <SignupConsentForm submitting={submitting} error={consentError} onSubmit={handleConsentSubmit} />
      </PhoneShell>
    )
  }

  return (
    <PhoneShell>
      {/* justify-center 대신 my-auto — 고정 높이 셸에서 넘칠 때 위가 잘리지 않게(CHMO-396) */}
      <div className="flex flex-1 flex-col overflow-y-auto py-5">
        <div className="my-auto">
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
      </div>
    </PhoneShell>
  )
}
