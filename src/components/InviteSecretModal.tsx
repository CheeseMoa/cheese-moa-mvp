import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '../hooks/useMutation'
import { updateInviteSecrets } from '../api/groups'
import {
  JOIN_KEY_MAX,
  JOIN_KEY_RULE_TEXT,
  JOIN_PASSWORD_MAX,
  JOIN_PASSWORD_RULE_TEXT,
  joinKeyFormatError,
  joinPasswordFormatError,
  sanitizeJoinSecretInput,
} from '../lib/joinSecret'
import type { GroupInviteChannel, ID } from '../types/api'
import { Button, Modal, TextField, useToast } from './ui'

interface InviteSecretModalProps {
  open: boolean
  onClose: () => void
  groupId: ID | string
  /** 지금 값 — 입력 초기값이자 '무엇이 바뀌었나' 판정 기준 */
  channel: GroupInviteChannel
  /** 저장 성공 후 초대 정보 refetch(값·링크·공유 문안이 새 코드로 갱신된다) */
  onUpdated: () => void
}

/**
 * 20 초대 · 참여 코드·비밀번호 변경 모달 (PATCH /groups/:id/invite — BE CHMO-673).
 *
 * 자동 발급 코드는 말로 전달할 수 있는 대문자 6자가 됐지만 여전히 난수라, 일반 모임에서는
 * 모임장이 `familytrip` 같은 **부를 수 있는 값**으로 갈아 쓰는 쪽이 실제 전달 경로다.
 *
 * 필드 둘을 한 모달에 담고 **바뀐 것만 보낸다** — API가 부분 수정이라, 안 바꾼 코드를 그대로
 * 되보내면 (서버가 자기 코드 재제출을 예외로 허용하긴 해도) 화면이 하지 않은 변경을 기록에
 * 남기게 된다. 둘 다 그대로면 제출 버튼이 잠긴다.
 *
 * 대상은 **관리자 채널뿐**(호출부가 그 탭에서만 연다) — 이 API는 멤버 채널 키·비밀번호를
 * 바꾸지 않는다.
 */
export function InviteSecretModal({
  open,
  onClose,
  groupId,
  channel,
  onUpdated,
}: InviteSecretModalProps) {
  const toast = useToast()
  const mutate = useMutation()
  const [joinKey, setJoinKey] = useState(channel.joinKey)
  const [password, setPassword] = useState(channel.password)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 저장 성공~refetch 도착 사이의 stale prop이 입력을 되돌리지 않게 ref로만 읽는다(RenameModal 관용)
  const channelRef = useRef(channel)
  useEffect(() => {
    channelRef.current = channel
  }, [channel])

  // 닫힘→열림 전환에만 현재 값으로 초기화(이전 입력·에러가 남지 않게)
  useEffect(() => {
    if (!open) return
    setJoinKey(channelRef.current.joinKey)
    setPassword(channelRef.current.password)
    setSubmitting(false)
    setError(null)
  }, [open])

  const joinKeyChanged = joinKey !== channel.joinKey
  const passwordChanged = password !== channel.password
  // 형식 오류는 **바꾼 필드에만** 표시한다 — 손대지 않은 값이 구 규칙(대소문자 혼합 12자 등)이면
  // 열자마자 빨간 줄이 뜬다. 그건 사용자가 만든 오류가 아니라 예전에 발급된 값일 뿐이다
  const joinKeyError = joinKeyChanged ? joinKeyFormatError(joinKey) : null
  const passwordError = passwordChanged ? joinPasswordFormatError(password) : null
  const canSubmit =
    (joinKeyChanged || passwordChanged) && !joinKeyError && !passwordError && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const patch = {
      ...(joinKeyChanged ? { joinKey } : {}),
      ...(passwordChanged ? { password } : {}),
    }
    await mutate(() => updateInviteSecrets(groupId, patch), {
      onSuccess: (next) => {
        // 성공 반영 — refetch 도착 전 다시 열어도 새 값이 보이게(stale prop 재시드 방지)
        channelRef.current = next.teacher
        toast.show(joinKeyChanged ? '🧀 참여 코드를 바꿨어요' : '🧀 비밀번호를 바꿨어요')
        onUpdated()
        onClose()
      },
      // SPACE409(코드 중복)·VALID400(형식) 모두 BE 메시지가 한국어 안내라 그대로 노출한다.
      // 화면을 닫지 않는다 — 다시 입력하는 자리가 여기다
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
      title="참여 코드·비밀번호 변경"
    >
      <form onSubmit={handleSubmit} noValidate className="mt-3.5 flex flex-col gap-3.5">
        <TextField
          label="참여 코드"
          placeholder={JOIN_KEY_RULE_TEXT}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          value={joinKey}
          error={joinKeyError}
          onChange={(e) => setJoinKey(sanitizeJoinSecretInput(e.target.value, JOIN_KEY_MAX))}
        />
        <TextField
          label="비밀번호"
          placeholder={JOIN_PASSWORD_RULE_TEXT}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={password}
          error={passwordError}
          onChange={(e) => setPassword(sanitizeJoinSecretInput(e.target.value, JOIN_PASSWORD_MAX))}
        />
        {/* 바꾸기 전에 알아야 할 사실 — 이미 보낸 링크·코드가 그 순간 죽는다(대소문자도 구분한다) */}
        <p className="-mt-1 text-xs leading-relaxed text-muted">
          코드를 바꾸면 먼저 보낸 링크·코드로는 참여할 수 없어요. 대문자와 소문자는 다른 글자로
          구분돼요.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        ) : null}
        <Button type="submit" fullWidth disabled={!canSubmit} className="mt-1">
          {submitting ? '저장 중…' : '저장'}
        </Button>
      </form>
    </Modal>
  )
}
