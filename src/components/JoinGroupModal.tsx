import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '../hooks/useMutation'
import { joinGroup } from '../api/groups'
import { Button, Modal, TextField, useToast } from './ui'

interface JoinGroupModalProps {
  open: boolean
  /** 스크림·ESC로 닫을 때. 참여 성공 시에는 호출되지 않고 모임 상세(05)로 이동한다 */
  onClose: () => void
  /** 초대 링크(/join/:joinKey) 진입 시 참여 코드 고정 — 코드 입력 필드 대신 안내로 표시 */
  fixedJoinKey?: string
}

/**
 * 02-1. 모임 참여 모달 (node 211:1520 · POST /groups/join).
 * 홈의 [모임 참여하기](코드 직접 입력)와 초대 링크 진입(코드 고정) 공용.
 */
export function JoinGroupModal({ open, onClose, fixedJoinKey }: JoinGroupModalProps) {
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
      onSuccess: (group) => {
        toast.show('🧀 모임에 참여했어요')
        // 초대 링크 진입은 참여 화면을 히스토리에서 교체(뒤로가기 시 빈 모달 재등장 방지),
        // 홈 모달 진입은 push — 뒤로가기로 홈 복귀
        navigate(`/groups/${group.id}`, { replace: fixedJoinKey !== undefined })
      },
      // 401(토큰 무효) — 초대 링크 진입이면 재로그인 후 참여 화면으로 복귀하게 returnTo를 싣는다(JoinPage와 동일)
      redirect: {
        state: fixedJoinKey !== undefined ? { returnTo: `/join/${fixedJoinKey}` } : undefined,
      },
      // WRONG_PASSWORD·NOT_FOUND·ALREADY_MEMBER 메시지는 사용자 노출 가능한 한국어
      onError: (msg) => {
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
      title="모임 참여"
    >
      <p className="mt-1.5 text-[13px] text-muted">초대받은 모임의 비밀번호를 입력하세요</p>
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
          {submitting ? '참여 중…' : '참여'}
        </Button>
      </form>
    </Modal>
  )
}
