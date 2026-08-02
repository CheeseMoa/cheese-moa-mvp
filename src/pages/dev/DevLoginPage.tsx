import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PhoneShell } from '../../components/PhoneShell'
import { BrandHero } from '../../components/BrandHero'
import { useMutation } from '../../hooks/useMutation'
import { login } from '../../api/auth'
import { setAuthTokens, setCurrentUserId } from '../../lib/auth'
import { postLoginDestination } from '../../lib/onboarding'
import { PIN_RE } from '../../lib/pin'
import { Button, PinField, TextField } from '../../components/ui'

/** 로그인에 가로막힌 화면(초대 링크 JoinPage 등)이 넘기는 복귀 목적지 */
interface AuthLocationState {
  returnTo?: string
}

/**
 * DEV 전용 닉네임+PIN 로그인 — 소셜 단일화(CHMO-557)로 01-1·01-2를 내리며 남긴 개발 입구.
 * 실 BE 확인은 test/1111, 목 시드는 이현정/1234가 유일한 진입로라 프로덕션 번들 밖에만 산다
 * (/dev/components와 같은 조건부 라우트, 진입은 01 랜딩의 DEV 링크). 가입 폼은 두지 않았다 —
 * 계정은 목 시드·소셜 로그인으로 만든다. BE /auth/login 엔드포인트가 제거되면 함께 걷는다.
 */
export function DevLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const mutate = useMutation()
  const returnTo = (location.state as AuthLocationState | null)?.returnTo
  const [nickname, setNickname] = useState('')
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = nickname.trim().length > 0 && PIN_RE.test(pin) && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    // 401(자격 오류)도 리다이렉트하지 않고 에러로 — 이 화면 자체가 로그인 표면이다
    await mutate(() => login({ nickname: nickname.trim(), pin }), {
      noAuthRedirect: true,
      onSuccess: (res) => {
        setAuthTokens(res)
        // 온보딩 완료 플래그가 계정별이라 판정보다 먼저 저장한다(CHMO-481)
        setCurrentUserId(res.userId)
        // 로그인에 가로막혀 온 경우(초대 링크 등) 원래 목적지로 복귀, 아니면 온보딩/홈
        navigate(postLoginDestination(returnTo), { replace: true })
      },
      onError: (msg) => {
        setError(msg)
        setSubmitting(false)
      },
    })
  }

  return (
    <PhoneShell>
      <BrandHero />
      <section className="flex flex-1 flex-col overflow-y-auto px-5 pb-safe-9 pt-5">
        <h2 className="text-[15px] font-bold text-text">닉네임+PIN 로그인 (DEV 전용)</h2>
        <form onSubmit={handleSubmit} noValidate className="mt-3 flex flex-1 flex-col">
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-card">
            <TextField
              label="닉네임"
              placeholder="닉네임 입력"
              autoComplete="username"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <PinField
              label="PIN 번호 (숫자 4자)"
              placeholder="PIN 번호 입력"
              autoComplete="current-password"
              value={pin}
              onChange={setPin}
            />
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-warn">
              {error}
            </p>
          ) : null}
          <div className="mt-auto pt-6">
            <Button type="submit" fullWidth disabled={!canSubmit}>
              {submitting ? '로그인 중…' : '로그인'}
            </Button>
          </div>
        </form>
      </section>
    </PhoneShell>
  )
}
