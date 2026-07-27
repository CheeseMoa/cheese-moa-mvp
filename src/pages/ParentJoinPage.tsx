import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Button, IconCheck, TextField, useToast } from '../components/ui'
import { useMutation } from '../hooks/useMutation'
import { ApiRequestError } from '../api/client'
import { joinGroup } from '../api/groups'
import { cx } from '../lib/cx'
import type { JoinGroupResult } from '../types/api'

/** 필수 동의 항목 — 문구 확정 전 자리(api-draft §8). 확정되면 상세 문구·버전과 consents 전송을 붙인다 */
const CONSENT_ITEMS = [
  '[필수] 개인정보 제3자 제공 동의 (문구 확정 전)',
  '[필수] 만 14세 미만 자녀의 법정대리인 동의',
] as const

type Step = 1 | 2 | 3

interface ParentJoinPageProps {
  /** 초대 링크의 참여 코드 — 대소문자 구분 그대로(CHMO-285) */
  joinKey: string
}

/**
 * 02-2. 학부모 참여 신청 3단계 (CHMO-445 · node 320:4/5/6 · POST /groups/join).
 * 진입은 학부모 초대 링크(/join/:joinKey?role=parent — 마커는 FE가 파생, api/groups.ts) 또는
 * 02-1 모달의 학부모 코드 감지 인계(서버 400 → 비밀번호 state 동반). 1/3 모임 비밀번호 →
 * 2/3 자녀 이름(자유 텍스트·복수) → 3/3 동의 → [동의하고 참여 신청] → 신청(PENDING) 생성.
 * 랜딩은 홈(§7-2 확정 — 대기 전용 화면 없음, 홈의 비활성 카드가 곧 "신청됨" 피드백).
 *
 * 1/3 [다음]은 childNames 없이 한 번 제출(프로브)한다 — 비밀번호 오류(JOIN403)·중복 신청(409)
 * 은 이 시점에 잡히고, 400(자녀 이름 필요)이면 관문 통과로 보고 2/3로 간다. 실 BE 검증 순서가
 * 목과 달라 400이 비밀번호 검증보다 앞서도, 최종 제출의 WRONG_PASSWORD를 1/3로 되돌리는
 * 안전망이 있어 흐름은 성립한다(실 BE 미구현 — 배포 후 실검증은 CHMO-449).
 *
 * 모임 이름은 신청 전엔 알 수 없어(코드로 모임을 조회하는 API 없음 — 시크릿 은닉) 와이어프레임의
 * "햇살반 · " 컨텍스트는 생략하고 "학부모님으로 참여"만 표시한다.
 */
export function ParentJoinPage({ joinKey }: ParentJoinPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const mutate = useMutation()

  // 02-1 모달이 학부모 코드를 감지해 인계할 때 입력했던 비밀번호를 실어 준다(재입력 생략)
  const handedPassword = (location.state as { password?: string } | null)?.password ?? ''

  const [step, setStep] = useState<Step>(1)
  const [password, setPassword] = useState(handedPassword)
  const [childNames, setChildNames] = useState<string[]>([''])
  const [agreed, setAgreed] = useState<boolean[]>(CONSENT_ITEMS.map(() => false))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 다자녀 신청(§2) — 비워둔 칸은 제출에서 걸러진다
  const names = childNames.map((n) => n.trim()).filter((n) => n.length > 0)
  const allAgreed = agreed.every(Boolean)
  const canProceed =
    !submitting &&
    (step === 1 ? password.trim().length > 0 : step === 2 ? names.length > 0 : allAgreed)

  const returnTo = `/join/${encodeURIComponent(joinKey)}?role=parent`

  // 신청 성공 공통 후속 — 랜딩은 홈. 구계약 즉시 합류(status active)는 매퍼가 흡수하므로
  // 링크 마커와 무관하게 서버가 확정한 결과(role·status)를 따른다
  const finishJoined = (result: JoinGroupResult) => {
    if (result.status === 'active') {
      toast.show('🧀 모임에 참여했어요')
      navigate(result.role === 'teacher' ? `/groups/${result.groupId}` : '/home', { replace: true })
      return
    }
    toast.show(`🧀 ${result.groupName || '모임'}에 참여 신청을 보냈어요 — 승인 후 이용할 수 있어요`)
    navigate('/home', { replace: true })
  }

  const handleBack = () => {
    if (submitting) return
    setError(null)
    if (step === 1) navigate('/home', { replace: true })
    else setStep((s) => (s - 1) as Step)
  }

  const toggleAll = () => {
    const next = !allAgreed
    setAgreed(CONSENT_ITEMS.map(() => next))
  }
  const toggleOne = (i: number) => setAgreed((prev) => prev.map((v, idx) => (idx === i ? !v : v)))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canProceed) return
    setError(null)
    if (step === 2) {
      setStep(3)
      return
    }
    setSubmitting(true)
    if (step === 1) {
      // 프로브 제출(파일 상단 주석) — 성공하면 선생님 코드에 마커가 붙은 링크 등으로 신청이
      // 이미 생성된 경우라 그대로 완료 처리한다
      await mutate(() => joinGroup({ joinKey, password: password.trim() }), {
        onSuccess: finishJoined,
        redirect: { state: { returnTo } },
        onError: (msg, err) => {
          setSubmitting(false)
          // 400 = 자녀 이름 필요(학부모 코드 확정) — 코드·비밀번호는 채워 보냈으므로 이 시점
          // 400의 다른 원인이 없다(목 VALID400 · BE 코드 미확인이라 status로 판별)
          if (err instanceof ApiRequestError && err.status === 400) {
            setStep(2)
            return
          }
          setError(msg)
        },
      })
      return
    }
    // 3/3 최종 제출 — 동의 문구 확정 전이라 consents는 싣지 않는다(§8 — body 자리만 예약)
    await mutate(() => joinGroup({ joinKey, password: password.trim(), childNames: names }), {
      onSuccess: finishJoined,
      redirect: { state: { returnTo } },
      onError: (msg, err) => {
        setSubmitting(false)
        // 실 BE 검증 순서가 목과 달라 1/3 프로브가 비밀번호를 못 거른 경우 — 1/3로 되돌려 고치게
        if (err instanceof ApiRequestError && err.code === 'WRONG_PASSWORD') setStep(1)
        setError(msg)
      },
    })
  }

  return (
    <PhoneShell>
      {/* 상단 진행 헤더(320:4) — 표준 Header 대신 ‹ + 진행 트랙 + n/3 */}
      <div className="flex shrink-0 items-center gap-3 px-5 pb-2 pt-4">
        <button
          type="button"
          aria-label={step === 1 ? '홈으로' : '이전 단계'}
          onClick={handleBack}
          disabled={submitting}
          className="text-xl leading-none text-text disabled:text-muted"
        >
          ‹
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
        <span className="text-xs font-medium text-muted">{step}/3</span>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-1 flex-col overflow-y-auto px-5 pb-safe-9 pt-3"
      >
        {step === 1 && (
          <>
            <p className="text-xs font-medium text-muted">학부모님으로 참여</p>
            <h2 className="mt-1.5 text-[22px] font-bold leading-snug text-text">
              모임 비밀번호를
              <br />
              입력해 주세요
            </h2>
            <p className="mt-1.5 text-[13px] text-muted">초대 메시지에 함께 온 비밀번호예요</p>
            <TextField
              className="mt-5"
              label="비밀번호"
              placeholder="비밀번호 입력"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-[22px] font-bold leading-snug text-text">아이 이름을 알려주세요</h2>
            <p className="mt-1.5 text-[13px] text-muted">선생님이 확인한 뒤 아이 앨범과 연결해 줘요</p>
            <div className="mt-5 flex flex-col gap-3">
              {childNames.map((name, i) => (
                <TextField
                  key={i}
                  label={i === 0 ? '아이 이름' : `아이 이름 ${i + 1}`}
                  placeholder="예) 김민준"
                  autoComplete="off"
                  value={name}
                  onChange={(e) =>
                    setChildNames((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                  }
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setChildNames((prev) => [...prev, ''])}
              className="mt-3 self-start text-[13px] font-bold text-accent"
            >
              ＋ 아이 추가
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-[22px] font-bold leading-snug text-text">
              사진을 보려면
              <br />
              동의가 필요해요
            </h2>
            <p className="mt-1.5 text-[13px] text-muted">아이들 사진 보호를 위해 꼭 확인해 주세요</p>
            <div className="mt-5 flex flex-col gap-2.5">
              <ConsentRow emphasis label="모두 동의합니다" checked={allAgreed} onToggle={toggleAll} />
              {CONSENT_ITEMS.map((label, i) => (
                <ConsentRow
                  key={label}
                  label={label}
                  checked={agreed[i]}
                  onToggle={() => toggleOne(i)}
                />
              ))}
            </div>
          </>
        )}

        {error ? (
          <p role="alert" className="mt-3 text-sm text-warn">
            {error}
          </p>
        ) : null}

        <div className="mt-auto pt-6">
          <Button type="submit" fullWidth disabled={!canProceed}>
            {step < 3 ? (submitting ? '확인 중…' : '다음') : submitting ? '신청 중…' : '동의하고 참여 신청'}
          </Button>
        </div>
      </form>
    </PhoneShell>
  )
}

interface ConsentRowProps {
  label: string
  checked: boolean
  onToggle: () => void
  /** 상단 "모두 동의합니다" 행 — 굵은 타이포 */
  emphasis?: boolean
}

/** 동의 행 — 행 전체가 탭 영역. 문구 확정 전이라 상세 보기(›)는 아직 없다(§8 — 확정 시 시트 추가) */
function ConsentRow({ label, checked, onToggle, emphasis }: ConsentRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3.5 text-left shadow-card"
    >
      <span
        aria-hidden="true"
        className={cx(
          'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border transition-colors',
          checked ? 'border-primary bg-primary text-white' : 'border-[#C9C2B4] bg-white text-transparent',
        )}
      >
        <IconCheck size={14} />
      </span>
      <span
        className={cx('leading-snug text-text', emphasis ? 'text-[15px] font-bold' : 'text-[13px]')}
      >
        {label}
      </span>
    </button>
  )
}
