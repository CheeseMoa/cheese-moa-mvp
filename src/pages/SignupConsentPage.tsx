import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { SignupConsentForm } from '../components/SignupConsentForm'
import { Button, LoadState } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useMutation } from '../hooks/useMutation'
import { listAgreements, submitAgreements } from '../api/agreements'
import { evaluateConsentGate } from '../lib/consentGate'
import { SIGNUP_AGREEMENT_ITEMS } from '../legal/signupAgreements'

/** 로그인 게이트가 실어 주는 원 목적지 — 새로고침으로 유실되면 홈 */
interface ConsentLocationState {
  returnTo?: string
}

/**
 * 01-A. 가입 동의 (CHMO-479 · 정본 docs/legal/app-copy.md §1~§4) — 첫 로그인 후 필수 동의를
 * 수집해야 서비스에 들어간다. 로그인 성공 시점(01-C 소셜 콜백·DEV 로그인)이
 * `evaluateConsentGate`로 판정해 여기로 보내고, 기존 계정도 기록이 없으면 한 번은 지난다.
 * 신규 가입은 이제 이 화면에 오지 않는다 — PIN 가입은 signup()이(CHMO-600), 소셜 가입은
 * 01-C의 가입 분기(exchange 동봉, CHMO-602)가 동의를 가입과 한 트랜잭션으로 기록해
 * 게이트가 pass로 지난다. 폼 자체는 01-C와 공용(SignupConsentForm).
 *
 * 제출은 화면에 보여준 FE 문구 버전을 싣는다(CHMO-517). 서버 버전과 다르면(구버전 번들 캐시)
 * 동의 화면 대신 새로고침 안내로 빠진다 — 제출해 봐야 VALID400이라 체크부터 시키지 않는다.
 */
export function SignupConsentPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const mutate = useMutation()
  const returnTo = (location.state as ConsentLocationState | null)?.returnTo ?? '/home'

  const agreementsApi = useApi('agreements', (signal) => listAgreements(signal))
  const verdict = agreementsApi.data ? evaluateConsentGate(agreementsApi.data) : null

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    // 폼이 전 항목 체크에서만 제출을 열므로 전부 agreed: true — 버전은 화면에 보여준 문구의 것
    await mutate(
      () =>
        submitAgreements(
          SIGNUP_AGREEMENT_ITEMS.map((item) => ({
            type: item.type,
            version: item.version,
            agreed: true,
          })),
        ),
      {
        onSuccess: () => navigate(returnTo, { replace: true }),
        onError: (msg) => {
          setError(msg)
          setSubmitting(false)
        },
      },
    )
  }

  // 이미 전부 동의된 계정의 직접 진입(주소창 등) — 수집할 것이 없으니 원 목적지로
  if (verdict === 'pass') return <Navigate to={returnTo} replace />

  return (
    <PhoneShell>
      {verdict === 'consent' ? (
        <SignupConsentForm submitting={submitting} error={error} onSubmit={handleSubmit} />
      ) : (
        <main className="flex flex-1 flex-col overflow-y-auto px-5 pt-7">
          <h1 className="text-xl text-heading">서비스 이용 동의</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            치즈모아를 시작하려면 아래 항목을 확인하고 동의해 주세요.
          </p>

          <LoadState
            loading={agreementsApi.loading}
            error={agreementsApi.error}
            onRetry={agreementsApi.refetch}
            unauthorizedTo="/login"
          />

          {verdict === 'stale' ? (
            // 서버가 아는 버전과 이 앱이 보여줄 문구의 버전이 다르다 — 새 문구 배포 후 구버전
            // 번들을 캐시로 들고 있는 상태. 체크를 받아도 제출이 거부되므로 새로고침부터.
            <div className="my-auto py-10 text-center">
              <p className="text-sm leading-relaxed text-text">
                약관 문구가 새 버전으로 바뀌었어요.
                <br />
                새로고침한 뒤 다시 동의해 주세요.
              </p>
              <div className="mt-6">
                <Button fullWidth onClick={() => window.location.reload()}>
                  새로고침
                </Button>
              </div>
            </div>
          ) : null}
        </main>
      )}
    </PhoneShell>
  )
}
