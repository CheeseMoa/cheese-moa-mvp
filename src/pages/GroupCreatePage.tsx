import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Button, Header, TextField, useToast } from '../components/ui'
import { useMutation } from '../hooks/useMutation'
import { createGroup } from '../api/groups'

/**
 * 03. 모임 만들기 · node 211:1411 · POST /groups → 모임 상세(05).
 * 가격/요금 워딩은 노출하지 않는다(CHMO-424 — screen-spec 03의 무료 배지·업그레이드 카피 제거).
 */
export function GroupCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const mutate = useMutation()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim().length > 0 && password.trim().length > 0 && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    await mutate(() => createGroup({ name: name.trim(), password: password.trim() }), {
      onSuccess: (group) => {
        toast.show('🧀 모임을 만들었어요')
        // 상세에서 뒤로가기가 작성 폼으로 돌아오지 않게 폼 히스토리를 교체
        navigate(`/groups/${group.id}`, { replace: true })
      },
      onError: (msg) => {
        setError(msg)
        setSubmitting(false)
      },
    })
  }

  return (
    <PhoneShell>
      {/* 제출 중 이탈하면 모임은 생성되는데 이동·토스트가 없어 중복 생성을 유발 — 뒤로가기 차단 */}
      <Header backTo="/home" backLabel="홈" title="모임 만들기" backDisabled={submitting} />
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-1 flex-col overflow-y-auto px-5 pb-safe-9 pt-5"
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-card">
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
