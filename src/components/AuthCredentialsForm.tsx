import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiFetch, toErrorMessage } from '../lib/api'
import { setAccessToken } from '../lib/auth'
import type { AuthResponse } from '../types/api'
import { Button, TextField } from './ui'

const PIN_RE = /^\d{4}$/

/** 로그인에 가로막힌 화면(초대 링크 JoinPage 등)이 넘기는 복귀 목적지 */
interface AuthLocationState {
  returnTo?: string
}

/** 모드별 문구·엔드포인트 — 모순 조합(로그인 폼 + 가입 링크 등)이 타입상 불가능하게 한곳에 묶는다 */
const MODE_CONFIG = {
  login: {
    heading: '로그인',
    submitLabel: '로그인',
    endpoint: '/auth/login',
    pinAutoComplete: 'current-password',
    switchPrompt: '계정이 없으신가요?',
    switchLabel: '계정 생성',
    switchTo: '/signup',
  },
  signup: {
    heading: '계정 생성',
    submitLabel: '생성',
    endpoint: '/auth/signup',
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
  const { heading, submitLabel, endpoint, pinAutoComplete, switchPrompt, switchLabel, switchTo } =
    MODE_CONFIG[mode]
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as AuthLocationState | null)?.returnTo
  const [nickname, setNickname] = useState('')
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = nickname.trim().length > 0 && PIN_RE.test(pin) && !submitting

  // 제출 중 다른 화면으로 떠난 뒤 뒤늦게 온 응답이 토큰 저장·/home 이동을 실행하지 않게 하는 플래그
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch<AuthResponse>(endpoint, {
        method: 'POST',
        auth: 'none',
        body: { nickname: nickname.trim(), pin },
      })
      if (!alive.current) return
      setAccessToken(res.accessToken)
      // 로그인에 가로막혀 온 경우(초대 링크 등) 원래 목적지로 복귀
      navigate(returnTo ?? '/home', { replace: true })
    } catch (err) {
      if (!alive.current) return
      // 서버 에러 메시지(INVALID_CREDENTIALS·NICKNAME_TAKEN·INVALID_PIN)는 사용자 노출 가능한 한국어
      setError(toErrorMessage(err))
      setSubmitting(false)
    }
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
          <TextField
            label="PIN 번호 (숫자 4자)"
            placeholder="PIN 번호 입력"
            type="password"
            inputMode="numeric"
            autoComplete={pinAutoComplete}
            value={pin}
            // maxLength는 붙여넣기를 필터보다 먼저 잘라 PIN을 훼손하므로 쓰지 않는다 — 여기서 4자리로 자름
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
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
        </div>
      </form>
    </section>
  )
}
