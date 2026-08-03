import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '../hooks/useMutation'
import { login } from '../api/auth'
import { listAgreements } from '../api/agreements'
import { setAuthTokens, setCurrentUserId } from '../lib/auth'
import { evaluateConsentGate } from '../lib/consentGate'
import { postLoginDestination } from '../lib/onboarding'
import { PIN_RE } from '../lib/pin'
import { Button, PinField, TextField } from './ui'

interface PinLoginFormProps {
  /** 로그인에 가로막힌 화면(초대 링크 JoinPage 등)이 넘긴 복귀 목적지 */
  returnTo?: string
  /** ID 칸 라벨 — DEV 폼은 레거시 그대로 '닉네임'(CHMO-440), 심사용 숨김 폼은 심사 노트와 같은 'ID' */
  idLabel?: string
  idPlaceholder?: string
}

/**
 * 닉네임(ID)+PIN 로그인 폼 공용 — DEV 입구(/dev/login)와 01 랜딩의 심사용 숨김 폼(CHMO-572)이
 * 같은 제출 흐름을 타야 해서 추출했다: 토큰 저장 → 가입 동의 게이트(CHMO-479, 소셜 콜백 01-C와
 * 동일 판정) → returnTo/홈 복귀. 폼이 둘이 되면서 이 흐름이 갈라지면 심사관만 동의 게이트를
 * 건너뛰는 식의 어긋남이 생긴다.
 */
export function PinLoginForm({
  returnTo,
  idLabel = '닉네임',
  idPlaceholder = '닉네임 입력',
}: PinLoginFormProps) {
  const navigate = useNavigate()
  const mutate = useMutation()
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
    // 401(자격 오류)도 리다이렉트하지 않고 에러로 — 이 폼 자체가 로그인 표면이다
    await mutate(() => login({ nickname: nickname.trim(), pin }), {
      noAuthRedirect: true,
      onSuccess: async (res) => {
        setAuthTokens(res)
        // 온보딩 완료 플래그가 계정별이라 판정보다 먼저 저장한다(CHMO-481)
        setCurrentUserId(res.userId)
        // 로그인에 가로막혀 온 경우(초대 링크 등) 원래 목적지로 복귀, 아니면 온보딩/홈
        const dest = postLoginDestination(returnTo)
        // 가입 동의 게이트(CHMO-479) — 조회 실패는 통과(로그인은 막지 않는다)
        const gate = await listAgreements()
          .then(evaluateConsentGate)
          .catch(() => 'pass' as const)
        if (gate === 'pass') navigate(dest, { replace: true })
        else navigate('/consent', { replace: true, state: { returnTo: dest } })
      },
      onError: (msg) => {
        setError(msg)
        setSubmitting(false)
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-card">
        <TextField
          label={idLabel}
          placeholder={idPlaceholder}
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
      <div className="pt-6">
        <Button type="submit" fullWidth disabled={!canSubmit}>
          {submitting ? '로그인 중…' : '로그인'}
        </Button>
      </div>
    </form>
  )
}
