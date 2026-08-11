import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Button, Header, IconClose, TextField, useToast } from '../components/ui'
import { useMutation } from '../hooks/useMutation'
import { joinGroup } from '../api/groups'
import { buildJoinPath } from '../lib/joinLink'
import type { JoinGroupResult } from '../types/api'

interface ParentJoinPageProps {
  /** 초대 링크의 참여 코드 — 대소문자 구분 그대로(CHMO-285) */
  joinKey: string
  /** 링크가 동봉한 모임명(lib/joinLink 마커 — 공유 시점 스냅샷, 없으면 중립 표기) */
  groupName?: string
}

/**
 * 02-2. 비즈니스 모임 참여 신청 — 단일 화면 (CHMO-607 · node 371:41 · POST /groups/join).
 * 종전 3단계(비밀번호 → 자녀 이름 → 동의, CHMO-445·587)를 한 화면으로 합쳤다: 비밀번호 +
 * "누구의 사진을 보시나요?" 인물 이름(복수·행 삭제) → [신청하기]. 1/3 프로브 제출·3/3 동의
 * 단계·childConsentVersion 동봉(카탈로그 조회 포함)은 폐지 — 법적 동의는 가입(01-A) 1회로
 * 일원화한다(정본 group-type-proposal §1 · ⚠ BE CHMO-586 검증 폐지와 배포 게이트).
 *
 * 진입은 viewer(멤버) 초대 링크(role 마커 — lib/joinLink) 또는 02-1 모달의 viewer 코드 감지
 * 인계(서버 400 → 비밀번호 state 동반 프리필). 모임명은 링크 동봉 스냅샷이다 — 코드로 모임을
 * 조회하는 API가 없어(시크릿 은닉) 마커가 없으면 중립 표기로 폴백한다.
 *
 * 랜딩은 status 무관 **홈**(§7-2 — 신청은 PENDING이고 홈의 대기 카드가 곧 "신청됨" 피드백).
 * 02-1의 active 직행을 여기 적용하지 않는 이유: viewer의 모임 화면은 18(/parent/groups)이고
 * 05 직행은 ROLE403으로 빠진다 — 신청 흐름은 홈이 어느 계약에서도 안전하다.
 */
export function ParentJoinPage({ joinKey, groupName }: ParentJoinPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const mutate = useMutation()

  // 02-1 모달이 viewer 코드를 감지해 인계할 때 입력했던 비밀번호를 실어 준다(재입력 생략)
  const handedPassword = (location.state as { password?: string } | null)?.password ?? ''

  const [password, setPassword] = useState(handedPassword)
  const [personNames, setPersonNames] = useState<string[]>([''])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 복수 인물 신청(§2) — 비워둔 칸은 제출에서 걸러진다
  const names = personNames.map((n) => n.trim()).filter((n) => n.length > 0)
  const canSubmit = !submitting && password.trim().length > 0 && names.length > 0

  const returnTo = buildJoinPath(joinKey, { groupType: 'business', role: 'viewer', groupName })

  const finishJoined = (result: JoinGroupResult) => {
    toast.show(
      result.status === 'active'
        ? '🧀 모임에 참여했어요'
        : `🧀 ${result.groupName || '모임'}에 참여 신청을 보냈어요 · 승인되면 이용할 수 있어요`,
    )
    navigate('/home', { replace: true })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    await mutate(() => joinGroup({ joinKey, password: password.trim(), childNames: names }), {
      onSuccess: finishJoined,
      redirect: { state: { returnTo } },
      // WRONG_PASSWORD·중복 신청 409 등 — 단일 화면이라 되돌릴 단계가 없다. 그 자리 인라인 안내
      onError: (msg) => {
        setSubmitting(false)
        setError(msg)
      },
    })
  }

  return (
    <PhoneShell>
      {/* 링크 진입이라 히스토리가 없을 수 있다 — 뒤로가기는 홈 폴백(replace) */}
      <Header title="모임 참여 신청" backLabel="홈" onBack={() => navigate('/home', { replace: true })} />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-1 flex-col overflow-y-auto px-5 pb-safe-9 pt-4"
      >
        {/* 어느 모임에 신청하는지 — 모임명(링크 스냅샷) + 유형 표시 */}
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-base font-bold text-text">
            {groupName ?? '초대받은 모임'}
          </span>
          <span className="shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted">
            비즈니스
          </span>
        </div>

        <TextField
          className="mt-4"
          label="참여 비밀번호"
          placeholder="초대 메시지에 함께 온 비밀번호"
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <h2 className="mt-7 text-[17px] font-bold leading-snug text-text">
          누구의 사진을 보시나요?
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          관리자가 승인하면 입력한 인물의 사진을 볼 수 있어요.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {personNames.map((name, i) => {
            const label = i === 0 ? '인물 이름' : `인물 이름 ${i + 1}`
            return (
              <div key={i} className="flex items-end gap-1">
                <TextField
                  className="min-w-0 flex-1"
                  label={label}
                  placeholder="예) 김민준"
                  autoComplete="off"
                  value={name}
                  onChange={(e) =>
                    setPersonNames((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                  }
                />
                {/* 잘못 추가한 행 삭제 — 마지막 한 행은 남긴다(제출 최소 1명·내용은 지우면 됨) */}
                {personNames.length > 1 && (
                  <button
                    type="button"
                    aria-label={`${label} 삭제`}
                    onClick={() => setPersonNames((prev) => prev.filter((_, idx) => idx !== i))}
                    className="flex h-12 w-10 shrink-0 items-center justify-center text-muted transition-colors active:text-text"
                  >
                    <IconClose size={16} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setPersonNames((prev) => [...prev, ''])}
          className="mt-3 self-start text-[13px] font-bold text-accent"
        >
          ＋ 인물 추가
        </button>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-warn">
            {error}
          </p>
        ) : null}

        <div className="mt-auto pt-6">
          <Button type="submit" fullWidth disabled={!canSubmit}>
            {submitting ? '신청 중…' : '신청하기'}
          </Button>
        </div>
      </form>
    </PhoneShell>
  )
}
