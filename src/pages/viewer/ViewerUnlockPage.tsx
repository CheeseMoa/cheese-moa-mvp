import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { BrandHero } from '../../components/BrandHero'
import { PhoneShell } from '../../components/PhoneShell'
import { Button, TextField } from '../../components/ui'
import { apiFetch, toErrorMessage } from '../../lib/api'
import { getViewerToken, setViewerToken } from '../../lib/viewer'
import type { ViewerUnlockResponse } from '../../types/api'

const PASSWORD_RE = /^\d{4}$/

/**
 * 잠금 해제(뷰어 진입) · POST /share/:token/unlock
 * 학부모 전용 비밀번호(모임 단위, 숫자 4자)를 확인하고 viewerToken을 받아 15-L로.
 * 이미 해제된 링크(viewerToken 보유)는 입력 없이 바로 통과 — 토큰이 무효면
 * 뷰어 API 401 때 apiFetch가 지우고 이 화면으로 되돌아온다.
 */
export function ViewerUnlockPage() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 제출 중 화면을 떠난 뒤 뒤늦게 온 응답이 토큰 저장·이동을 실행하지 않게 하는 플래그
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const eventsPath = `/share/${token}/events`
  if (token && getViewerToken(token)) return <Navigate to={eventsPath} replace />

  const canSubmit = PASSWORD_RE.test(password) && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch<ViewerUnlockResponse>(`/share/${token}/unlock`, {
        method: 'POST',
        auth: 'none',
        body: { password },
      })
      if (!alive.current) return
      setViewerToken(token, res.viewerToken)
      navigate(eventsPath, { replace: true })
    } catch (err) {
      if (!alive.current) return
      // 서버 에러 메시지(WRONG_PASSWORD·NOT_FOUND)는 사용자 노출 가능한 한국어
      setError(toErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <PhoneShell>
      <BrandHero />
      <section className="flex flex-1 flex-col px-5 pb-9 pt-5">
        <h2 className="text-[15px] font-bold text-text">우리 아이 사진 보기</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          선생님께 받은 비밀번호를 입력하면 공개된 이벤트 사진을 볼 수 있어요.
        </p>
        <form onSubmit={handleSubmit} noValidate className="mt-3 flex flex-1 flex-col">
          <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
            <TextField
              label="학부모 전용 비밀번호 (숫자 4자)"
              placeholder="비밀번호 입력"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={password}
              // maxLength는 붙여넣기를 필터보다 먼저 잘라 비밀번호를 훼손하므로 쓰지 않는다 — 여기서 4자리로 자름
              onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-warn">
              {error}
            </p>
          ) : null}
          <div className="mt-auto pt-6">
            <Button type="submit" fullWidth disabled={!canSubmit}>
              {submitting ? '확인 중…' : '사진 보러 가기'}
            </Button>
          </div>
        </form>
      </section>
    </PhoneShell>
  )
}
