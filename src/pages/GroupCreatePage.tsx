import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Button, Header, TextField, useToast } from '../components/ui'
import { useMutation } from '../hooks/useMutation'
import { createGroup } from '../api/groups'

/**
 * 03. 모임 만들기 · node 211:1411 · POST /groups → 모임 상세(05).
 * 요금제·업그레이드 안내는 노출하지 않는다 — MVP에 결제가 없어 '무료'라는 말이 유료 전환을
 * 예고하는 문구로만 읽힌다(2026-07-29 결정).
 */
export function GroupCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const mutate = useMutation()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  // 보호자 동의 확보 확인 게이트(CHMO-478) — 아동 사진 처리는 법정대리인 동의가 전제(개인정보 보호법 제22조의2)
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit =
    name.trim().length > 0 && password.trim().length > 0 && consentConfirmed && !submitting

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
        <div className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-card">
          <p className="text-xs leading-relaxed text-muted">
            치즈모아는 사진 속 아이들의 얼굴을 분석해 인물별 앨범을 만들어요. 만 14세 미만 아이의
            사진을 올리려면 보호자(법정대리인)의 동의가 필요해요.
          </p>
          <label className="mt-3 flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(e) => setConsentConfirmed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
            />
            <span className="text-sm leading-relaxed text-text">
              사진에 등장하는 모든 아이의 보호자로부터 촬영·업로드, 얼굴 인식을 통한 인물별 분류,
              보호자 공유에 대한 동의를 받았습니다.
            </span>
          </label>
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
