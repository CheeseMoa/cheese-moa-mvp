import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { InviteSheet, ParentShareSheet } from '../components/GroupShareSheets'
import {
  Button,
  EmptyState,
  EventCard,
  Header,
  LoadState,
  Modal,
  TextField,
  useToast,
} from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useMutation } from '../hooks/useMutation'
import { getGroup, renameGroup } from '../api/groups'
import { createEvent, listGroupEvents } from '../api/events'
import type { Group } from '../types/api'

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
 * [+ 이벤트 생성]은 06-M 모달(CreateEventModal)로 뜬다.
 */
export function GroupDetailPage() {
  const { groupId = '' } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const groupApi = useApi(`group:${groupId}`, (signal) => getGroup(groupId, signal))
  const eventsApi = useApi(`group-events:${groupId}`, (signal) =>
    listGroupEvents(groupId, signal),
  )
  const [inviteOpen, setInviteOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const group = groupApi.data
  const events = eventsApi.data ?? []
  // BE 상세 응답엔 eventCount가 없어 이벤트 목록 길이로 파생하는데(CHMO-192), 목록이 아직
  // 안 왔으면 length 0을 '이벤트 0개'로 단정하지 않는다 — 값이 확정될 때만 표시(깜빡임 방지).
  const eventCount = group?.eventCount ?? (eventsApi.data ? events.length : null)

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
              인원 {group.memberCount}명{eventCount !== null ? ` · 이벤트 ${eventCount}개` : ''}
            </p>

            <h3 className="mt-5 text-[13px] font-bold text-muted">이벤트</h3>
            <div className="mt-2 flex flex-1 flex-col">
              {eventsApi.loading || eventsApi.error ? (
                <LoadState
                  loading={eventsApi.loading}
                  error={eventsApi.error}
                  loadingText="이벤트를 불러오는 중…"
                  onRetry={eventsApi.refetch}
                  unauthorizedTo="/login"
                  notFoundTo="/home"
                  notFoundLabel="홈으로"
                />
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
                <Button fullWidth onClick={() => setCreateOpen(true)}>
                  ＋ 이벤트 생성
                </Button>
                <Button variant="secondary" fullWidth onClick={() => setShareOpen(true)}>
                  ⧉ 학부모님에게 공유
                </Button>
              </div>
            </div>
          </>
        ) : (
          <LoadState
            loading={groupApi.loading}
            error={groupApi.error}
            loadingText="모임을 불러오는 중…"
            onRetry={groupApi.refetch}
            unauthorizedTo="/login"
            notFoundTo="/home"
            notFoundLabel="홈으로"
          />
        )}
      </main>

      <InviteSheet groupId={groupId} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <ParentShareSheet groupId={groupId} open={shareOpen} onClose={() => setShareOpen(false)} />
      <CreateEventModal open={createOpen} onClose={() => setCreateOpen(false)} groupId={groupId} />
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
  const toast = useToast()
  const mutate = useMutation()
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

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    await mutate(() => renameGroup(group.id, name.trim()), {
      onSuccess: () => {
        toast.show('🧀 모임 이름을 바꿨어요')
        onRenamed()
        onClose()
      },
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

/** 오늘 날짜 YYYY-MM-DD(로컬) — 06-M 이벤트 이름 기본값 */
function todayDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

interface CreateEventModalProps {
  open: boolean
  onClose: () => void
  groupId: string
}

/**
 * 06-M. 이벤트 이름 입력(모달) · node 211:1544
 * 기본값 = 오늘 날짜(스펙: 클라이언트가 채워 전송) · POST /groups/:id/events → 빈 이벤트(06-E)로 이동.
 */
function CreateEventModal({ open, onClose, groupId }: CreateEventModalProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const mutate = useMutation()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 닫힘→열림 전환에만 오늘 날짜로 초기화(이전 입력·에러가 남지 않게)
  useEffect(() => {
    if (!open) return
    setName(todayDate())
    setSubmitting(false)
    setError(null)
  }, [open])

  const canSubmit = name.trim().length > 0 && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    await mutate(() => createEvent(groupId, { name: name.trim() }), {
      onSuccess: (event) => {
        toast.show('🧀 이벤트를 만들었어요')
        navigate(`/groups/${groupId}/events/${event.id}`)
      },
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
      title="이벤트 이름"
    >
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        오늘 날짜가 들어가 있어요. 그대로 두거나 수정한 뒤 생성하세요.
      </p>
      <form onSubmit={handleSubmit} noValidate className="mt-3.5 flex flex-col gap-3.5">
        <TextField
          label="이름"
          placeholder="예) 2026-06-27 이벤트"
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
          {submitting ? '생성 중…' : '생성'}
        </Button>
      </form>
    </Modal>
  )
}
