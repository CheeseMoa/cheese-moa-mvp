import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '../hooks/useMutation'
import { ApiRequestError } from '../api/client'
import { joinGroup } from '../api/groups'
import { setPreferredTourTrack } from '../lib/onboarding'
import { Button, Modal, TextField, useToast } from './ui'

interface JoinGroupModalProps {
  open: boolean
  /** 스크림·ESC로 닫을 때. 신청 성공 시에는 호출되지 않고 홈(02)으로 이동한다 */
  onClose: () => void
  /** 초대 링크(/join/:joinKey) 진입 시 참여 코드 고정 — 코드 입력 필드 대신 안내로 표시 */
  fixedJoinKey?: string
  /** 홈 모달 진입의 신청 성공 후속(목록 refetch 등) — 미지정이면 onClose로 닫기만 한다 */
  onJoined?: () => void
}

/**
 * 02-1. 모임 참여 모달 (node 211:1520 · POST /groups/join).
 * 홈의 [모임 참여하기](코드 직접 입력)와 초대 링크 진입(코드 고정) 공용.
 *
 * 학부모 전환(CHMO-444)으로 참여는 즉시 합류가 아니라 **신청(PENDING) 생성**이다 — 성공 시
 * 모임 상세가 아니라 홈으로 간다(승인 전엔 모임 접근 불가). 단 구계약 실 BE(즉시 합류)가
 * 아직 배포돼 있어, 응답 status가 active면 토스트 문구만 "참여했어요"로 갈린다(공존 구간).
 *
 * 이 모달은 **선생님 코드 전용 경로**(학부모 코드는 02-2로 인계)인데, 선생님 합류도
 * 승인제로 통일되면서(CHMO-475) 문구를 "참여"에서 "참여 신청"으로 바꿨다 — 비밀번호를
 * 맞게 넣어도 바로 못 들어간다는 사실을 누르기 전에 알려야 한다.
 * 학부모 코드를 마커 없이 넣으면(수동 입력 등) 서버 400(자녀 이름 필요)으로 감지해
 * 02-2 3단계(ParentJoinPage)로 인계한다(CHMO-445).
 */
export function JoinGroupModal({ open, onClose, fixedJoinKey, onJoined }: JoinGroupModalProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const mutate = useMutation()
  const [joinKeyInput, setJoinKeyInput] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 닫았다 다시 열 때 이전 입력·에러가 남지 않게 초기화
  useEffect(() => {
    if (!open) return
    setJoinKeyInput('')
    setPassword('')
    setSubmitting(false)
    setError(null)
  }, [open])

  // 실 BE joinKey는 대소문자 혼합 발급 + 대소문자 구분 매칭 — 케이스를 훼손하면 안 된다(CHMO-285)
  const joinKey = (fixedJoinKey ?? joinKeyInput).trim()
  const canSubmit = joinKey.length > 0 && password.trim().length > 0 && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    await mutate(() => joinGroup({ joinKey, password: password.trim() }), {
      onSuccess: (result) => {
        toast.show(
          result.status === 'active'
            ? '🧀 모임에 참여했어요'
            : `🧀 ${result.groupName || '모임'}에 참여 신청을 보냈어요 — 승인 후 이용할 수 있어요`,
        )
        // 성공 후 랜딩은 status와 무관하게 **홈**(모임 카드) — active여도 상세로 직행하지 않는다.
        // 구계약(즉시 합류) 응답 형태로 승인제 BE가 응답하는 과도기에 상세 직행이 권한 오류
        // ("권한이 없는 스페이스")로 터진 실측 반영: 홈은 어느 계약에서도 안전하다.
        // 초대 링크 진입은 참여 화면을 히스토리에서 교체(뒤로가기 시 빈 모달 재등장 방지),
        // 홈 모달 진입은 닫고 목록 갱신
        if (fixedJoinKey !== undefined) {
          // 400(자녀 이름 필요)으로 갈라지지 않았으니 선생님 키다 — 다음 둘러보기의 갈래로 쓴다.
          // fromJoin은 도착 직후 둘러보기가 이 안내를 덮지 않게 미루는 신호(CHMO-504)
          setPreferredTourTrack('teacher')
          navigate('/home', { replace: true, state: { fromJoin: true } })
        } else (onJoined ?? onClose)()
      },
      // 401(토큰 무효) — 초대 링크 진입이면 재로그인 후 참여 화면으로 복귀하게 returnTo를 싣는다(JoinPage와 동일)
      redirect: {
        state: fixedJoinKey !== undefined ? { returnTo: `/join/${fixedJoinKey}` } : undefined,
      },
      // WRONG_PASSWORD·NOT_FOUND·ALREADY_MEMBER 메시지는 사용자 노출 가능한 한국어
      onError: (msg, err) => {
        // 400 = 자녀 이름 필요 = 학부모 코드(코드·비밀번호는 채워 보냈으므로 다른 400 원인이
        // 없다 — 목 VALID400 · BE 코드 미확인이라 status로 판별) → 02-2 3단계로 인계.
        // 입력한 비밀번호는 state로 넘겨 1/3에 프리필한다(CHMO-445)
        if (err instanceof ApiRequestError && err.status === 400) {
          navigate(`/join/${encodeURIComponent(joinKey)}?role=parent`, {
            replace: fixedJoinKey !== undefined,
            state: { password: password.trim() },
          })
          return
        }
        setError(msg)
        setSubmitting(false)
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submitting) onClose()
      }}
      title="모임 참여 신청"
    >
      <p className="mt-1.5 text-[13px] text-muted">
        초대받은 모임의 비밀번호를 입력하세요.
        <br />
        모임의 선생님이 승인하면 이용할 수 있어요.
      </p>
      <form onSubmit={handleSubmit} noValidate className="mt-3.5 flex flex-col gap-3.5">
        {fixedJoinKey === undefined ? (
          <TextField
            label="참여 코드"
            placeholder="참여 코드 입력"
            autoComplete="off"
            value={joinKeyInput}
            onChange={(e) => setJoinKeyInput(e.target.value)}
          />
        ) : (
          <p className="text-[13px] text-muted">
            참여 코드: <span className="font-bold text-text">{joinKey}</span>
          </p>
        )}
        <TextField
          label="비밀번호"
          placeholder="비밀번호 입력"
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        ) : null}
        <Button type="submit" fullWidth disabled={!canSubmit} className="mt-1">
          {submitting ? '신청 중…' : '참여 신청'}
        </Button>
      </form>
    </Modal>
  )
}
