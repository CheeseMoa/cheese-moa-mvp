import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiRequestError, toErrorMessage } from '../lib/api'
import { Button, Modal, TextField, useToast } from './ui'

interface RenameModalProps {
  open: boolean
  onClose: () => void
  title: string
  label: string
  placeholder?: string
  /** 서버의 현재 이름 — 열릴 때 입력 초기값 */
  initialName: string
  /** 이름 저장(PATCH 등) — 성공 시 resolve, 실패 시 throw */
  submit: (name: string) => Promise<unknown>
  /** 저장 성공 토스트 문구 */
  successMessage: string
  /** 저장 성공 후 상세 갱신(refetch) */
  onRenamed: () => void
  /** 입력 아래 보조 안내(이름전파 고지 등) */
  note?: ReactNode
}

/**
 * 이름 수정 모달 공용 — 이벤트명(08)·인물 앨범명(09, 이름전파)에서 재사용.
 * 저장 중 화면을 떠났을 때의 늦은 응답, 열린 입력을 덮는 뒤늦은 refetch, 401(토큰 무효)
 * 복귀를 모두 여기서 처리한다. 실제 PATCH는 호출부가 `submit`으로 주입한다.
 */
export function RenameModal({
  open,
  onClose,
  title,
  label,
  placeholder,
  initialName,
  submit,
  successMessage,
  onRenamed,
  note,
}: RenameModalProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState(initialName)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 최신 이름은 ref로만 읽는다 — 열린 모달의 입력을 뒤늦은 refetch가 덮어쓰지 않게.
  // 단 렌더-거울(매 렌더 대입)은 저장 성공~refetch 도착 사이 stale prop을 재시드하므로,
  // prop이 실제 바뀔 때만 동기화하고 저장 성공 시엔 직접 갱신한다(재오픈 시 되돌림 방지).
  const initialNameRef = useRef(initialName)
  useEffect(() => {
    initialNameRef.current = initialName
  }, [initialName])

  // 닫힘→열림 전환에만 현재 이름으로 초기화(이전 입력·에러가 남지 않게)
  useEffect(() => {
    if (!open) return
    setName(initialNameRef.current)
    setSubmitting(false)
    setError(null)
  }, [open])

  // 제출 중 화면을 떠난 뒤 뒤늦게 온 응답이 토스트·갱신을 실행하지 않게 하는 플래그
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const nextName = name.trim()
      await submit(nextName)
      if (!alive.current) return
      // 성공 반영 — refetch 도착 전 재오픈해도 새 이름이 보이게(stale prop 재시드 방지)
      initialNameRef.current = nextName
      toast.show(successMessage)
      onRenamed()
      onClose()
    } catch (err) {
      if (!alive.current) return
      // 401 = 토큰 무효(apiFetch가 이미 지움) — 모달 안 재시도는 영원히 실패하므로 로그인으로 복귀
      if (err instanceof ApiRequestError && err.status === 401) {
        navigate('/login', { replace: true })
        return
      }
      setError(toErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submitting) onClose()
      }}
      title={title}
    >
      <form onSubmit={handleSubmit} noValidate className="mt-3.5 flex flex-col gap-3.5">
        <TextField
          label={label}
          placeholder={placeholder}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {note ? <p className="-mt-1 text-xs leading-relaxed text-muted">{note}</p> : null}
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
