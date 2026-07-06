import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { InviteSheet, ParentShareSheet } from '../components/GroupShareSheets'
import {
  Button,
  EmptyState,
  EventCard,
  Header,
  Modal,
  TextField,
  useToast,
} from '../components/ui'
import { useApi } from '../hooks/useApi'
import { apiFetch, ApiRequestError, toErrorMessage } from '../lib/api'
import type { EventItem, Group } from '../types/api'

/** "2026-06-15" → "6월 15일" (이벤트 카드 메타) — YYYY-MM-DD가 아니면 원문 그대로 */
function formatEventDate(date: string): string {
  const [, month = '', day = ''] = date.split('-')
  const m = parseInt(month, 10)
  const d = parseInt(day, 10)
  if (!Number.isFinite(m) || !Number.isFinite(d)) return date
  return `${m}월 ${d}일`
}

/**
 * 05. 모임 상세 = 이벤트 목록 · node 211:1443(목록) · 211:1432/211:1505(빈/신규)
 * GET /groups/:id · GET /groups/:id/events · PATCH /groups/:id(⚙ 이름 수정).
 * 초대·학부모 공유는 이 화면 위 시트(GroupShareSheets)로 뜬다(확정 — 별도 페이지 아님).
 * 카드 메타의 '인원'은 이벤트 API에 없어 날짜·사진만 표시(확정) ·
 * 이벤트 생성 모달(06-M)은 CHMO-113 — 그전까지 버튼은 토스트 안내(확정).
 */
export function GroupDetailPage() {
  const { groupId = '' } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const groupApi = useApi<Group>(`/groups/${groupId}`)
  const eventsApi = useApi<{ events: EventItem[] }>(`/groups/${groupId}/events`)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)

  // 401 = 토큰 무효(apiFetch가 이미 지움) — 재시도해도 영원히 실패하므로 로그인으로 복귀
  if (groupApi.error?.status === 401 || eventsApi.error?.status === 401)
    return <Navigate to="/login" replace />

  const group = groupApi.data
  const events = eventsApi.data?.events ?? []

  return (
    <PhoneShell>
      <Header
        backTo="/home"
        backLabel="홈"
        title="모임 상세"
        right={
          group && (
            <button
              type="button"
              aria-label="모임 설정"
              onClick={() => setRenameOpen(true)}
              className="text-lg text-muted"
            >
              ⚙
            </button>
          )
        }
      />
      <main className="flex flex-1 flex-col px-5 pb-9 pt-5">
        {/* 데이터가 있으면 재조회(이름 수정 refetch) 중에도 유지 — 로딩/에러로 화면을 교체하지 않는다 */}
        {group ? (
          <>
            <div className="flex items-center gap-2.5">
              <h2 className="min-w-0 flex-1 truncate text-xl font-bold text-text">{group.name}</h2>
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                ＋ 선생님 초대
              </Button>
            </div>
            <p className="mt-1 text-[13px] text-muted">
              인원 {group.memberCount}명 · 이벤트 {group.eventCount}개
            </p>

            <h3 className="mt-5 text-[13px] font-bold text-muted">이벤트</h3>
            <div className="mt-2 flex flex-1 flex-col">
              {eventsApi.loading ? (
                <p className="py-11 text-center text-sm text-muted">이벤트를 불러오는 중…</p>
              ) : eventsApi.error ? (
                <div className="flex flex-col items-center gap-3 py-11">
                  <p className="text-center text-sm text-warn">{toErrorMessage(eventsApi.error)}</p>
                  <Button size="sm" variant="secondary" onClick={eventsApi.refetch}>
                    다시 시도
                  </Button>
                </div>
              ) : events.length === 0 ? (
                <EmptyState
                  title="아직 이벤트가 없어요"
                  description={
                    <>
                      첫 이벤트를 만들어
                      <br />
                      행사 사진을 정리해 보세요.
                    </>
                  }
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {events.map((event) => (
                    <li key={event.id}>
                      <EventCard
                        name={event.name}
                        status={event.status}
                        meta={`${formatEventDate(event.date)} · 사진 ${event.photoCount}장`}
                        onClick={() => navigate(`/groups/${groupId}/events/${event.id}`)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-auto flex flex-col gap-3 pt-6">
                <Button fullWidth onClick={() => toast.show('이벤트 생성은 준비 중이에요')}>
                  ＋ 이벤트 생성
                </Button>
                <Button variant="secondary" fullWidth onClick={() => setShareOpen(true)}>
                  ⧉ 학부모님에게 공유
                </Button>
              </div>
            </div>
          </>
        ) : groupApi.loading ? (
          <p className="py-11 text-center text-sm text-muted">모임을 불러오는 중…</p>
        ) : groupApi.error ? (
          <div className="flex flex-col items-center gap-3 py-11">
            <p className="text-center text-sm text-warn">{toErrorMessage(groupApi.error)}</p>
            <Button size="sm" variant="secondary" onClick={groupApi.refetch}>
              다시 시도
            </Button>
          </div>
        ) : null}
      </main>

      <InviteSheet groupId={groupId} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <ParentShareSheet groupId={groupId} open={shareOpen} onClose={() => setShareOpen(false)} />
      {group && (
        <RenameGroupModal
          open={renameOpen}
          onClose={() => setRenameOpen(false)}
          group={group}
          onRenamed={groupApi.refetch}
        />
      )}
    </PhoneShell>
  )
}

interface RenameGroupModalProps {
  open: boolean
  onClose: () => void
  group: Group
  /** PATCH 성공 후 상세 갱신(refetch) */
  onRenamed: () => void
}

/** 모임 설정 ⚙ = 모임 이름 수정(F2.4 — name만 변경 가능) · PATCH /groups/:id */
function RenameGroupModal({ open, onClose, group, onRenamed }: RenameGroupModalProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState(group.name)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 최신 이름은 ref로만 읽는다 — 의존성에 두면 열린 모달의 입력을 뒤늦은 refetch가 덮어쓴다
  const groupNameRef = useRef(group.name)
  groupNameRef.current = group.name

  // 닫힘→열림 전환에만 현재 이름으로 초기화(이전 입력·에러가 남지 않게)
  useEffect(() => {
    if (!open) return
    setName(groupNameRef.current)
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
      await apiFetch<Group>(`/groups/${group.id}`, {
        method: 'PATCH',
        body: { name: name.trim() },
      })
      if (!alive.current) return
      toast.show('🧀 모임 이름을 바꿨어요')
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
      title="모임 이름 수정"
    >
      <form onSubmit={handleSubmit} noValidate className="mt-3.5 flex flex-col gap-3.5">
        <TextField
          label="모임 이름"
          placeholder="예) 햇살반 학부모"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
