import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Button, Header, TextField, useToast } from '../components/ui'
import { cx } from '../lib/cx'
import { useMutation } from '../hooks/useMutation'
import { createGroup } from '../api/groups'
import type { GroupType } from '../types/api'

/**
 * 03. 모임 만들기 · node 375:5(유형 선택) · 375:19/375:32(이름 입력) · POST /groups → 모임 상세(05).
 * 유형(일반/비즈니스)을 먼저 고르고 이름만 적는 2단계 — 한 라우트 안 단계 state(02-2 관용).
 * 참여 비밀번호 입력란은 없다(BE CHMO-599 — 서버 자동 발급·초대 화면에서만 노출)라 생성 완료
 * 토스트가 비밀번호의 행방을 알린다(CHMO-603 AC — 랜딩한 05 하단 [초대 관리]가 그 자리다).
 * 보호자 동의 확인 게이트·생성 직후 attestation 자동 전송은 뺐다(CHMO-603 — 체크 없이 자동
 * 전송만 남기면 허위 기록이 된다. BUSINESS 첫 업로드의 428 모달(CHMO-516)이 확인을 이어받는다).
 * 요금제·업그레이드 안내는 노출하지 않는다 — MVP에 결제가 없어 '무료'라는 말이 유료 전환을
 * 예고하는 문구로만 읽힌다(2026-07-29 결정).
 */

const GROUP_TYPE_CARDS: Array<{ type: GroupType; emoji: string; name: string; examples: string }> = [
  { type: 'general', emoji: '🧀', name: '일반 모임', examples: '가족 여행, 친구 모임' },
  { type: 'business', emoji: '🏢', name: '비즈니스 모임', examples: '유치원, 여행사, 학원' },
]

const NAME_PLACEHOLDER: Record<GroupType, string> = {
  general: '예) 제주 가족여행',
  business: '예) 햇살반',
}

export function GroupCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const mutate = useMutation()
  const [groupType, setGroupType] = useState<GroupType | null>(null)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!groupType || !canSubmit) return
    setSubmitting(true)
    setError(null)
    await mutate(() => createGroup({ name: name.trim(), groupType }), {
      onSuccess: (group) => {
        toast.show('🧀 모임을 만들었어요 · 참여 비밀번호는 초대 관리에서 확인해요')
        // 상세에서 뒤로가기가 작성 폼으로 돌아오지 않게 폼 히스토리를 교체
        navigate(`/groups/${group.id}`, { replace: true })
      },
      onError: (msg) => {
        setError(msg)
        setSubmitting(false)
      },
    })
  }

  // 1단계 — 유형 선택: 카드 탭이 곧 다음(별도 CTA 없음)
  if (!groupType) {
    return (
      <PhoneShell>
        <Header backTo="/home" backLabel="홈" title="모임 만들기" />
        <main className="flex-1 overflow-y-auto px-5 pb-safe-9 pt-5">
          <div className="grid grid-cols-2 gap-4">
            {GROUP_TYPE_CARDS.map((card) => (
              <button
                key={card.type}
                type="button"
                onClick={() => setGroupType(card.type)}
                // 나란한 두 카드라 blur 30(shadow-card)은 사이 16px을 뿌옇게 채운다 — stack 그림자(CHMO-532 결)
                className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-border bg-white p-4 shadow-card-stack transition active:scale-[0.99]"
              >
                <span aria-hidden="true" className="text-[28px] leading-none">
                  {card.emoji}
                </span>
                <span className="mt-5 text-[15px] text-heading">{card.name}</span>
                <span className="mt-2.5 text-xs text-muted">{card.examples}</span>
              </button>
            ))}
          </div>
        </main>
      </PhoneShell>
    )
  }

  // 2단계 — 이름 입력: 유형 pill + 이름 필드뿐(비밀번호·동의 게이트 없음)
  return (
    <PhoneShell>
      {/* 제출 중 이탈하면 모임은 생성되는데 이동·토스트가 없어 중복 생성을 유발 — 뒤로가기 차단 */}
      <Header
        onBack={() => {
          setGroupType(null)
          setError(null)
        }}
        backLabel="모임 만들기"
        title="모임 만들기"
        backDisabled={submitting}
      />
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-1 flex-col overflow-y-auto px-5 pb-safe-9 pt-4"
      >
        <span
          className={cx(
            'self-start rounded-full px-2.5 py-1 text-[11px] font-bold',
            groupType === 'business' ? 'bg-primary/20 text-heading' : 'bg-black/[.06] text-muted',
          )}
        >
          {groupType === 'business' ? '비즈니스 모임' : '일반 모임'}
        </span>
        <TextField
          className="mt-4"
          label="모임 이름"
          placeholder={NAME_PLACEHOLDER[groupType]}
          autoComplete="off"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {groupType === 'business' ? (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            멤버 신청을 승인하고, 검토한 사진만 공개하는 모임이에요.
          </p>
        ) : null}
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
