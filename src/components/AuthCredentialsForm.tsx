import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation } from '../hooks/useMutation'
import { login, signup } from '../api/auth'
import { setAuthTokens } from '../lib/auth'
import { PIN_RE } from '../lib/pin'
import { SocialLoginButtons } from './SocialLoginButtons'
import { Button, PinField, TextField } from './ui'

/** 로그인에 가로막힌 화면(초대 링크 JoinPage 등)이 넘기는 복귀 목적지 */
interface AuthLocationState {
  returnTo?: string
}

/** 모드별 문구·요청 함수 — 모순 조합(로그인 폼 + 가입 링크 등)이 타입상 불가능하게 한곳에 묶는다 */
const MODE_CONFIG = {
  login: {
    heading: '로그인',
    submitLabel: '로그인',
    submit: login,
    pinAutoComplete: 'current-password',
    switchPrompt: '계정이 없으신가요?',
    switchLabel: '계정 생성',
    switchTo: '/signup',
  },
  signup: {
    heading: '계정 생성',
    submitLabel: '생성',
    submit: signup,
    pinAutoComplete: 'new-password',
    switchPrompt: '이미 계정이 있으신가요?',
    switchLabel: '로그인',
    switchTo: '/login',
  },
} as const

interface AuthCredentialsFormProps {
  mode: keyof typeof MODE_CONFIG
}

/**
 * 닉네임 + 4자리 PIN 자격증명 폼 — 01-1 로그인 · 01-2 계정 생성 공용.
 * 빈 값/PIN 형식 오류면 CTA 비활성(screen-spec 01-1·01-2 상태), 성공 시 토큰 저장 후 /home.
 */
export function AuthCredentialsForm({ mode }: AuthCredentialsFormProps) {
  const { heading, submitLabel, submit, pinAutoComplete, switchPrompt, switchLabel, switchTo } =
    MODE_CONFIG[mode]
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
    await mutate(() => submit({ nickname: nickname.trim(), pin }), {
      noAuthRedirect: true,
      onSuccess: (res) => {
        setAuthTokens(res)
        // 로그인에 가로막혀 온 경우(초대 링크 등) 원래 목적지로 복귀
        navigate(returnTo ?? '/home', { replace: true })
      },
      // 서버 에러 메시지(INVALID_CREDENTIALS·NICKNAME_TAKEN·INVALID_PIN)는 사용자 노출 가능한 한국어
      onError: (msg) => {
        setError(msg)
        setSubmitting(false)
      },
    })
  }

  return (
    <section className="flex flex-1 flex-col px-5 pb-9 pt-5">
      <h2 className="text-[15px] font-bold text-text">{heading}</h2>
      {returnTo?.startsWith('/join/') && (
        <p className="mt-3 rounded-xl bg-primary/15 px-4 py-3 text-[13px] leading-relaxed text-text">
          🧀 초대받은 모임에 참여하려면 로그인이 필요해요 — 완료하면 참여 화면으로 이어져요.
        </p>
      )}
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
            autoComplete={pinAutoComplete}
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
          <p className="mb-3 text-center text-sm text-muted">
            {switchPrompt}{' '}
            <Link
              to={switchTo}
              state={location.state} // 로그인 ↔ 계정 생성 전환 시 returnTo 유실 방지
              aria-disabled={submitting || undefined}
              tabIndex={submitting ? -1 : undefined}
              onClick={(e) => {
                if (submitting) e.preventDefault()
              }}
              className={
                submitting ? 'pointer-events-none font-bold text-muted' : 'font-bold text-accent'
              }
            >
              {switchLabel}
            </Link>
          </p>
          <Button type="submit" fullWidth disabled={!canSubmit}>
            {submitting ? `${submitLabel} 중…` : submitLabel}
          </Button>
          {/* 소셜 로그인(CHMO-359) — 가입/로그인 겸용이라 두 모드 모두 노출, PIN 폼과 병행 */}
          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted">또는 소셜 계정으로 계속하기</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <SocialLoginButtons returnTo={returnTo} />
        </div>
      </form>
    </section>
  )
}
