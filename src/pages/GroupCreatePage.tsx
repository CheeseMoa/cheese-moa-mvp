import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Button, Header, IconBuilding, IconPeople, TextField, useToast } from '../components/ui'
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

/**
 * 유형 선택 카드 — 이모지(🧀/🏢) 대신 프로젝트 라인 아이콘 세트를 쓴다: 두 이모지가 음식/건물로
 * 그림 계열이 다른 데다 OS마다 모양이 달라, 나란히 놓으면 한 벌로 안 읽힌다.
 * 아이콘 타일 색이 유형 위계를 대신한다 — 일반은 중립(surface), 비즈니스는 옐로우 틴트로
 * 05 헤더 배지·02 카드 배지·03 2단계 pill과 같은 처방(primary/20 계열)을 잇는다.
 */
const GROUP_TYPE_CARDS: Array<{
  type: GroupType
  Icon: typeof IconPeople
  name: string
  examples: string
  tile: string
}> = [
  {
    type: 'general',
    Icon: IconPeople,
    name: '일반 모임',
    examples: '가족 여행 · 친구 모임',
    tile: 'bg-surface text-heading',
  },
  {
    type: 'business',
    Icon: IconBuilding,
    name: '비즈니스 모임',
    examples: '유치원 · 학원 · 여행사',
    tile: 'bg-primary/25 text-heading',
  },
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
          {/* 정사각 2-up에서 세로 리스트로(홈 모임 카드와 같은 문법) — 정사각은 가운데가 비고
              이름·예시가 바닥에 눌려 위계가 죽는다. 가로가 넓어져 예시 줄도 잘리지 않는다 */}
          <div className="flex flex-col gap-3">
            {GROUP_TYPE_CARDS.map((card) => (
              <button
                key={card.type}
                type="button"
                onClick={() => setGroupType(card.type)}
                // 세로로 쌓이는 카드라 blur 30(shadow-card)은 사이 12px을 뿌옇게 채운다(CHMO-532)
                className="group flex w-full items-center gap-3.5 rounded-2xl border border-border bg-white p-4 text-left shadow-card-stack transition active:scale-[0.99]"
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    // 누르는 동안 타일이 옐로우로 차오른다 — 두 카드가 같은 피드백을 준다
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors group-active:bg-primary',
                    card.tile,
                  )}
                >
                  <card.Icon size={26} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] text-heading">{card.name}</span>
                  <span className="mt-1 block text-[13px] text-muted">{card.examples}</span>
                </span>
                <span className="shrink-0 text-lg text-[#C9C2B4]" aria-hidden="true">
                  ›
                </span>
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
