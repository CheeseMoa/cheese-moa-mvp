import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { BrandHero } from '../../components/BrandHero'
import { PhoneShell } from '../../components/PhoneShell'
import { Button, PinField } from '../../components/ui'
import { useMutation } from '../../hooks/useMutation'
import { unlockViewer } from '../../api/viewer'
import { PIN_RE } from '../../lib/pin'
import { getViewerToken, setViewerGroupName, setViewerToken } from '../../lib/viewer'

/**
 * 잠금 해제(뷰어 진입) · POST /share/:token/unlock
 * 학부모 전용 비밀번호(모임 단위, 숫자 4자)를 확인하고 viewerToken을 받아 15-L로.
 * 이미 해제된 링크(viewerToken 보유)는 입력 없이 바로 통과 — 토큰이 무효면
 * 뷰어 API 401 때 apiFetch가 지우고 이 화면으로 되돌아온다.
 */
export function ViewerUnlockPage() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const mutate = useMutation()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eventsPath = `/share/${token}/events`
  if (token && getViewerToken(token)) return <Navigate to={eventsPath} replace />

  const canSubmit = PIN_RE.test(password) && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    // 401(자격 오류)도 리다이렉트하지 않고 에러로 — 이 화면 자체가 잠금 해제 표면이다
    await mutate(() => unlockViewer(token, password), {
      noAuthRedirect: true,
      onSuccess: (res) => {
        setViewerToken(token, res.viewerToken)
        // BE는 모임명을 unlock 응답에만 준다 — 공개 이벤트 목록(15-L)이 캐시로 표시(CHMO-192)
        setViewerGroupName(token, res.groupName)
        navigate(eventsPath, { replace: true })
      },
      // 서버 에러 메시지(WRONG_PASSWORD·NOT_FOUND)는 사용자 노출 가능한 한국어
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
        <h2 className="text-[15px] font-bold text-text">우리 아이 사진 보기</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          선생님께 받은 비밀번호를 입력하면 공개된 이벤트 사진을 볼 수 있어요.
        </p>
        <form onSubmit={handleSubmit} noValidate className="mt-3 flex flex-1 flex-col">
          <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
            <PinField
              label="학부모 전용 비밀번호 (숫자 4자)"
              placeholder="비밀번호 입력"
              value={password}
              onChange={setPassword}
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
