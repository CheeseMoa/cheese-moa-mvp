import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Button, Header, TextField, useToast } from '../components/ui'
import { useMutation } from '../hooks/useMutation'
import { attestGuardianConsent } from '../api/agreements'
import { createGroup } from '../api/groups'
import { GUARDIAN_CONSENT_COPY } from '../legal/consents'

/**
 * 03. 모임 만들기 · node 211:1411 · POST /groups → 모임 상세(05).
 * 참여 비밀번호 입력란은 없다(CHMO-604 — BE CHMO-599가 요청 password를 무시하고 자동 발급,
 * 초대 화면에서만 노출). 유형 선택 UI는 CHMO-603 개편 몫 — 그 전까지 이 화면은 현행 흐름
 * (보호자 동의 확인 게이트)의 의미 그대로 business로 생성한다.
 * 요금제·업그레이드 안내는 노출하지 않는다 — MVP에 결제가 없어 '무료'라는 말이 유료 전환을
 * 예고하는 문구로만 읽힌다(2026-07-29 결정).
 * 보호자 동의 확보 확인 체크는 **서버 기록으로도 남긴다**(CHMO-516) — 그래야 만든 사람이
 * 첫 업로드에서 같은 확인을 두 번 읽지 않는다(업로드 게이트는 BE CHMO-514).
 */
export function GroupCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const mutate = useMutation()
  const [name, setName] = useState('')
  // 보호자 동의 확보 확인 게이트(CHMO-478) — 아동 사진 처리는 법정대리인 동의가 전제(개인정보 보호법 제22조의2)
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim().length > 0 && consentConfirmed && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    await mutate(() => createGroup({ name: name.trim(), groupType: 'business' }), {
      onSuccess: (group) => {
        // 여기서 체크한 확인을 서버 기록으로 남긴다(CHMO-516). 기다리지 않는다 — 모임은 이미
        // 만들어졌고 이 기록은 업로드 게이트를 미리 통과시켜 두는 용도라 화면을 붙잡을 이유가 없다.
        // 실패해도 조용히 넘긴다: 첫 업로드에서 확인 모달이 뜨는 것이 안전망이다(이중 확인은
        // 이 호출이 성공하는 평소 경로에서만 사라진다).
        void attestGuardianConsent(group.id).catch(() => undefined)
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
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-card">
          <p className="text-xs leading-relaxed text-muted">{GUARDIAN_CONSENT_COPY.intro}</p>
          <label className="mt-3 flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(e) => setConsentConfirmed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
            />
            {/* 06-U 확인 모달과 같은 문장 — 서버에 남는 기록이 하나라 문구도 하나여야 한다 */}
            <span className="text-sm leading-relaxed text-text">
              {GUARDIAN_CONSENT_COPY.statement}
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
