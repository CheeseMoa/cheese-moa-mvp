import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Button, Header, TextField, useToast } from '../components/ui'
import { useAlive } from '../hooks/useAlive'
import { apiFetch, redirectIfUnauthorized, toErrorMessage } from '../lib/api'
import type { Group } from '../types/api'

/**
 * 03. 모임 만들기 · node 211:1411 · POST /groups → 모임 상세(05).
 * 업그레이드/결제는 MVP 미구현 — 배지·안내 카피만 표시(screen-spec 03).
 */
export function GroupCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim().length > 0 && password.trim().length > 0 && !submitting

  const alive = useAlive()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const group = await apiFetch<Group>('/groups', {
        method: 'POST',
        body: { name: name.trim(), password: password.trim() },
      })
      if (!alive.current) return
      toast.show('🧀 모임을 만들었어요')
      // 상세에서 뒤로가기가 작성 폼으로 돌아오지 않게 폼 히스토리를 교체
      navigate(`/groups/${group.id}`, { replace: true })
    } catch (err) {
      if (!alive.current) return
      if (redirectIfUnauthorized(err, navigate)) return
      setError(toErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <PhoneShell>
      {/* 제출 중 이탈하면 모임은 생성되는데 이동·토스트가 없어 중복 생성을 유발 — 뒤로가기 차단 */}
      <Header backTo="/home" backLabel="홈" title="모임 만들기" backDisabled={submitting} />
      <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col px-5 pb-9 pt-5">
        <span className="self-start rounded-full bg-primary/20 px-[11px] py-1.5 text-xs font-bold text-accent">
          무료 · 용량 차면 업그레이드
        </span>
        <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-card">
          <TextField
            label="모임 이름"
            placeholder="예) 햇살반 학부모"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label="비밀번호"
            placeholder="참여 시 입력할 비밀번호"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          요금제 선택 없이 무료로 시작해요. 저장 용량이 차면 업그레이드할 수 있어요.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-warn">
            {error}
          </p>
        ) : null}
        <div className="mt-auto pt-6">
          <Button type="submit" fullWidth disabled={!canSubmit}>
            {submitting ? '만드는 중…' : '모임 만들기'}
          </Button>
        </div>
      </form>
    </PhoneShell>
  )
}
