import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '../hooks/useMutation'
import { ApiRequestError } from '../api/client'
import { joinGroup } from '../api/groups'
import { buildJoinPath, type JoinLinkInfo } from '../lib/joinLink'
import type { JoinGroupResult } from '../types/api'
import { Button, Modal, TextField, useToast } from './ui'

interface JoinGroupModalProps {
  open: boolean
  /** 스크림·ESC로 닫을 때. 합류 성공 시에는 호출되지 않고 랜딩 규칙(아래)을 따른다 */
  onClose: () => void
  /** 초대 링크(/join/:joinKey) 진입 시 참여 코드 고정 — 코드 입력 필드 대신 안내로 표시 */
  fixedJoinKey?: string
  /** 초대 링크가 동봉한 모임 정보(lib/joinLink 마커 — 유형·모임명·카운트, CHMO-607) */
  linkInfo?: JoinLinkInfo
  /** 홈 모달 진입의 신청 성공 후속(목록 refetch 등) — 미지정이면 onClose로 닫기만 한다 */
  onJoined?: () => void
}

/**
 * 02-1. 모임 참여 모달 (node 371:31 · POST /groups/join).
 * 초대 링크 진입(코드 고정)이 주 경로고, 잘못된 링크(코드 공백)의 직접 입력 폴백을 겸한다.
 *
 * 링크 마커의 유형이 **일반(general)이면 참여 모달**이다(CHMO-607 — 모임명·"멤버 N · 이벤트 N"
 * 표시 + 비밀번호 → [참여하기]. 표시 정보는 링크 동봉 스냅샷이라 없으면 그 줄만 생략).
 * 일반 모임 즉시 합류는 BE 미구현(현행 승인제 유지 — CHMO-599)이라 응답 status로 랜딩을
 * 가른다: **active면 모임 화면 직행, pending이면 홈**(승인 대기 카드). 직행은 명시적 active에만
 * 열린다 — 형태 미상 응답은 매퍼가 pending으로 좁혀(CHMO-448 SPACE403 실측 재발 방지) 홈으로.
 *
 * 마커가 없거나 비즈니스 editor(관리자) 키면 종전 **참여 신청 모달**(CHMO-475 승인제 문구).
 * viewer(멤버) 코드를 마커 없이 넣으면(수동 입력 등) 서버 400(인물 이름 필요)으로 감지해
 * 02-2 단일 화면(ParentJoinPage)으로 인계한다(CHMO-445 관용 — 안전망으로 유지).
 */
export function JoinGroupModal({
  open,
  onClose,
  fixedJoinKey,
  linkInfo,
  onJoined,
}: JoinGroupModalProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const mutate = useMutation()
  const [joinKeyInput, setJoinKeyInput] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isGeneral = linkInfo?.groupType === 'general'

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

  // 02-1 표시용 메타 — 링크가 동봉한 값만(스냅샷). 둘 다 없으면 줄 자체를 걷는다
  const metaParts = [
    linkInfo?.memberCount !== undefined ? `멤버 ${linkInfo.memberCount}` : null,
    linkInfo?.eventCount !== undefined ? `이벤트 ${linkInfo.eventCount}개` : null,
  ].filter((part): part is string => part !== null)

  const finishJoined = (result: JoinGroupResult) => {
    if (result.status === 'active') {
      toast.show('🧀 모임에 참여했어요')
      // 즉시 합류(active)는 모임 화면 직행 — 초대 링크 진입이라 참여 화면은 히스토리에서 교체
      navigate(`/groups/${result.groupId}`, { replace: true })
      return
    }
    toast.show(`🧀 ${result.groupName || '모임'}에 참여 신청을 보냈어요 · 승인되면 이용할 수 있어요`)
    // 승인 전엔 모임 접근 불가(SPACE403) — 홈(승인 대기 카드)이 어느 계약에서도 안전한 랜딩이다.
    // 초대 링크 진입은 참여 화면을 히스토리에서 교체(뒤로가기 시 빈 모달 재등장 방지),
    // 홈 모달 진입(잘못된 링크 폴백)은 닫고 목록 갱신
    if (fixedJoinKey !== undefined) navigate('/home', { replace: true })
    else (onJoined ?? onClose)()
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    await mutate(() => joinGroup({ joinKey, password: password.trim() }), {
      onSuccess: finishJoined,
      // 401(토큰 무효) — 초대 링크 진입이면 재로그인 후 참여 화면으로 복귀하게 returnTo를 싣는다
      // (JoinPage와 동일). 마커까지 되살려야 복귀 후에도 같은 갈래·같은 표시 정보가 선다
      redirect: {
        state:
          fixedJoinKey !== undefined
            ? { returnTo: buildJoinPath(fixedJoinKey, linkInfo ?? {}) }
            : undefined,
      },
      // WRONG_PASSWORD·NOT_FOUND·ALREADY_MEMBER 메시지는 사용자 노출 가능한 한국어
      onError: (msg, err) => {
        // 400 = 인물 이름 필요 = viewer(멤버) 코드(코드·비밀번호는 채워 보냈으므로 다른 400
        // 원인이 없다 — 목 VALID400 · BE 코드 미확인이라 status로 판별) → 02-2 단일 화면 인계.
        // 입력한 비밀번호는 state로 넘겨 프리필한다(CHMO-445)
        if (err instanceof ApiRequestError && err.status === 400) {
          navigate(buildJoinPath(joinKey, { groupType: 'business', role: 'viewer' }), {
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
      title={isGeneral ? '모임 참여' : '모임 참여 신청'}
    >
      {isGeneral ? (
        // 일반 모임(02-1) — 어느 모임에 들어가는지부터 말한다(안내 문구 없음 — 회색 보조 문구 최소화)
        <div className="mt-1.5">
          {linkInfo?.groupName ? (
            <p className="text-lg font-bold leading-snug text-text">{linkInfo.groupName}</p>
          ) : null}
          {metaParts.length > 0 ? (
            <p className="mt-1 text-[13px] text-muted">{metaParts.join(' · ')}</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-1.5 text-[13px] text-muted">
          {linkInfo?.groupName ? (
            <>
              <span className="font-bold text-text">{linkInfo.groupName}</span> 모임의 비밀번호를
              입력하세요.
            </>
          ) : (
            '초대받은 모임의 비밀번호를 입력하세요.'
          )}
          <br />
          모임 관리자가 승인하면 이용할 수 있어요.
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate className="mt-3.5 flex flex-col gap-3.5">
        {fixedJoinKey === undefined ? (
          <TextField
            label="참여 코드"
            placeholder="참여 코드 입력"
            autoComplete="off"
            value={joinKeyInput}
            onChange={(e) => setJoinKeyInput(e.target.value)}
          />
        ) : null}
        <TextField
          label="비밀번호"
          placeholder="참여 비밀번호 입력"
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
          {isGeneral
            ? submitting
              ? '참여 중…'
              : '참여하기'
            : submitting
              ? '신청 중…'
              : '참여 신청'}
        </Button>
      </form>
    </Modal>
  )
}
