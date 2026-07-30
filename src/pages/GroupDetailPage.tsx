import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import {
  Button,
  ButtonLink,
  ConfirmDialog,
  CountBadge,
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
import { deleteGroup, getGroup, listJoinRequests, renameGroup } from '../api/groups'
import { createEvent, listGroupEvents } from '../api/events'
import { formatEventDate } from '../lib/eventDate'
import type { Group } from '../types/api'

/**
 * 05. 모임 상세 = 이벤트 목록 · node 211:1443(목록) · 307:4(학부모 전환 수정안 — CHMO-446)
 * GET /groups/:id · GET /groups/:id/events · PATCH /groups/:id(⚙ 이름 수정) ·
 * DELETE /groups/:id(⚙ 설정 안 모임 삭제 — CHMO-277) ·
 * GET /groups/:id/join-requests(대기 신청 수 — [＋ 초대하기] 뱃지).
 * 초대는 **화면 하나**다(CHMO-520 — 05-2 통합 시트 폐지, CHMO-446 반전): 초대 버튼이 20으로
 * 곧장 가고, 링크 보내기(부르기)와 신청 승인·아이 연결(받기)이 거기서 한 역할 탭 아래 붙어 있다.
 * 시트를 걷어낸 이유는 취향이 아니라 중복이다 — 시트와 20이 선생님/학부모님 세그먼트 탭을 각자
 * 한 벌씩 갖고 있었고, 같은 축으로 두 번 가르는 화면이 둘이라는 건 원래 한 화면이었다는 뜻이다.
 *
 * **화면 구성은 CHMO-530에서 다시 잡았다** — 상단 모임 색면 블록(모임명·인원·초대)을 없애고
 * 모임명은 헤더로, 인원은 목록 라벨 줄로, 초대는 하단으로 갈랐다. 08이 같은 중복(화면 종류명 +
 * 본문 제목)을 헤더로 올려 푼 것과 같은 해법이고(CHMO-522), 이로써 목록을 끝까지 내려도 어느
 * 모임인지가 남는다. 하단은 같은 크기 두 버튼([초대 관리] · [＋ 이벤트 생성])인데, CHMO-520이
 * 하단에서 [초대 관리]를 걷어낸 근거(초대와 이벤트 생성이 같은 무게로 쌓인다)는 상단 진입점이
 * 사라진 지금 성립하지 않는다 — 무게 차이는 색이 말한다(primary=할 일 / secondary=가는 일).
 *
 * 카드 메타의 '인원'은 이벤트 API에 없어 날짜·사진만 표시(확정) ·
 * [+ 이벤트 생성]은 06-M 모달(CreateEventModal)로 뜬다.
 */
export function GroupDetailPage() {
  const { groupId = '' } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const mutate = useMutation()
  const groupApi = useApi(`group:${groupId}`, (signal) => getGroup(groupId, signal))
  const eventsApi = useApi(`group-events:${groupId}`, (signal) => listGroupEvents(groupId, signal))
  // 대기 신청 수([초대 관리] 뱃지) — TEACHER 전용 조회(Q3)라 실패할 수 있는데(구계약 실 BE
  // 미구현 404 등) 뱃지만 생략하고 화면은 그대로 둔다. PARENT는 05 진입 자체가 없다(§7-3).
  // 승인제가 role 무관이 되면서(CHMO-475) 이 수에는 **선생님 신청도 포함**된다 — 탭별 내역은 20에서.
  const requestsApi = useApi(`join-requests:${groupId}`, (signal) =>
    listJoinRequests(groupId, signal),
  )
  const [renameOpen, setRenameOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // 모임 삭제(F2.5) — 성공 시 홈으로(뒤로가기로 죽은 상세에 돌아오지 않게 replace)
  const handleDelete = async () => {
    setDeleting(true)
    await mutate(() => deleteGroup(groupId), {
      onSuccess: () => {
        toast.show('🧀 모임을 삭제했어요')
        navigate('/home', { replace: true })
      },
      onError: (msg) => {
        toast.show(msg)
        setDeleting(false)
        setDeleteOpen(false)
      },
    })
  }

  const group = groupApi.data
  const events = eventsApi.data ?? []
  // BE 상세 응답엔 eventCount가 없어 이벤트 목록 길이로 파생하는데(CHMO-192), 목록이 아직
  // 안 왔으면 length 0을 '이벤트 0개'로 단정하지 않는다 — 값이 확정될 때만 표시(깜빡임 방지).
  const eventCount = group?.eventCount ?? (eventsApi.data ? events.length : null)
  // §7-3 카운트 분리 표기 — 구계약 상세(분리 필드 없음)는 기존 '인원 N명' 합산으로 폴백
  const memberPart =
    group?.teacherCount !== undefined && group?.parentCount !== undefined
      ? `선생님 ${group.teacherCount} · 학부모 ${group.parentCount}`
      : group?.memberCount !== undefined
        ? `인원 ${group.memberCount}명`
        : null
  // 이벤트 수는 모임 블록이 아니라 목록 섹션 라벨이 말한다(CHMO-515) — 인원과 한 줄에 섞여 있으면
  // 모임의 속성처럼 읽혔다. 값이 아직 없으면 라벨만("이벤트") 둔다
  const eventsLabel = eventCount !== null ? `이벤트 ${eventCount}개` : '이벤트'
  const pendingRequestCount = requestsApi.data?.length ?? 0

  return (
    <PhoneShell>
      {/* 헤더 중앙 = 모임명(CHMO-530). CHMO-515에서 타이틀을 비운 건 '모임 상세'라는 화면 종류명이
          본문 큰 제목(모임명)과 역할이 겹쳤기 때문이고, 이번엔 그 본문 블록 자체를 없앴으니 이름이
          설 자리가 헤더뿐이다 — 08이 같은 중복을 푼 방식과 같다(CHMO-522). 도착 전엔 비어 있다 */}
      <Header
        backTo="/home"
        backLabel="홈"
        title={group?.name}
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
      {/* 스크롤은 이벤트 목록만 갖는다(CHMO-530) — main은 스크롤 컨테이너가 아니고(overflow-hidden)
          라벨 줄·하단 액션이 shrink-0으로 위아래에 붙어 목록만 그 사이를 흐른다. sticky로 띄우지
          않는 이유는 CHMO-424 — 화면 내 sticky 바는 실기기 WebKit에서 위로 떠 콘텐츠가 비쳤다 */}
      <main className="flex flex-1 flex-col overflow-hidden px-5">
        {/* 데이터가 있으면 재조회(이름 수정 refetch) 중에도 유지 — 로딩/에러로 화면을 교체하지 않는다 */}
        {group ? (
          <>
            {/* 왼쪽은 아래 목록이 무엇인지(섹션 라벨 = 12px + 자간, CHMO-513), 오른쪽은 이 모임의
                인원. 인원은 색면 블록이 갖고 있던 정보인데 블록이 사라져 여기로 옮겼다 —
                §7-3 분리 표기(선생님 N · 학부모 N)는 그대로다 */}
            <div className="flex shrink-0 items-baseline gap-3 pb-2 pt-5">
              <h3 className="text-[12px] tracking-[0.06em] text-muted">{eventsLabel}</h3>
              {memberPart && (
                <p className="ml-auto truncate text-[12px] text-muted">{memberPart}</p>
              )}
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto">
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
                // 간격은 그림자 blur(8)보다 넓게 둔다(CHMO-532) — 좁으면 그림자가 사이를 메운다
                <ul className="flex flex-col gap-3.5">
                  {events.map((event) => (
                    <li key={event.id}>
                      <EventCard
                        name={event.name}
                        status={event.status}
                        meta={`${formatEventDate(event.date)} · 사진 ${event.photoCount}장`}
                        // 사진이 있는 이벤트만 커버를 진다(CHMO-515) — 빈 이벤트는 컴팩트 카드로 남아
                        // "아직 올릴 차례"임이 목록에서 그대로 보인다. 등록 직후 분류중은 사진 반영이
                        // 분석 커밋 시점이라 photoCount가 0일 수 있고, 그 구간도 컴팩트로 지나간다
                        cover={
                          event.photoCount > 0
                            ? { url: event.coverThumbnailUrl ?? null }
                            : undefined
                        }
                        onClick={() => navigate(`/groups/${groupId}/events/${event.id}`)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 두 버튼은 같은 크기다(flex-1 균등) — 위계는 폭이 아니라 색이 만든다: 이 화면에서
                할 일은 이벤트 생성(primary)이고 초대 관리는 20으로 가는 일(secondary·앵커 시맨틱).
                대기 수는 버튼 코너에 얹지 않고 라벨 안쪽 인라인으로 둔다: 20 탭 뱃지와 같은
                컴포넌트라 두 화면의 '대기 N건'이 한 모양이고, 오버레이 배지도 피한다 */}
            <div className="flex shrink-0 gap-2.5 pb-safe-9 pt-4">
              <ButtonLink
                to={`/groups/${groupId}/invites`}
                variant="secondary"
                className="flex-1 gap-1.5 whitespace-nowrap"
                aria-label={
                  pendingRequestCount > 0
                    ? `초대 관리 · 대기 신청 ${pendingRequestCount}건`
                    : undefined
                }
              >
                초대 관리
                {pendingRequestCount > 0 && <CountBadge count={pendingRequestCount} />}
              </ButtonLink>
              <Button className="flex-1 whitespace-nowrap" onClick={() => setCreateOpen(true)}>
                ＋ 이벤트 생성
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto pt-5">
            <LoadState
              loading={groupApi.loading}
              error={groupApi.error}
              loadingText="모임을 불러오는 중…"
              onRetry={groupApi.refetch}
              unauthorizedTo="/login"
              notFoundTo="/home"
              notFoundLabel="홈으로"
            />
          </div>
        )}
      </main>

      <CreateEventModal open={createOpen} onClose={() => setCreateOpen(false)} groupId={groupId} />
      {group && (
        <RenameGroupModal
          open={renameOpen}
          onClose={() => setRenameOpen(false)}
          group={group}
          onRenamed={groupApi.refetch}
          onDeleteRequest={() => {
            setRenameOpen(false)
            setDeleteOpen(true)
          }}
        />
      )}
      <ConfirmDialog
        open={deleteOpen}
        title="모임을 삭제할까요?"
        description="모임의 모든 이벤트·앨범·사진이 삭제되고, 학부모 공유 링크도 더 이상 열리지 않아요. 되돌릴 수 없어요."
        confirmLabel="삭제"
        danger
        busy={deleting}
        busyLabel="삭제 중…"
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </PhoneShell>
  )
}

interface RenameGroupModalProps {
  open: boolean
  onClose: () => void
  group: Group
  /** PATCH 성공 후 상세 갱신(refetch) */
  onRenamed: () => void
  /** '모임 삭제' 탭 — 이 모달을 닫고 확인 다이얼로그를 연다(모달 중첩 회피) */
  onDeleteRequest: () => void
}

/**
 * 모임 설정 ⚙ = 이름 수정(F2.4 — name만 변경 가능) · PATCH /groups/:id
 * + 모임 삭제 진입점(CHMO-277 — 위험 동작이라 설정 문맥 하단에 배치, 확인은 ConfirmDialog).
 */
function RenameGroupModal({
  open,
  onClose,
  group,
  onRenamed,
  onDeleteRequest,
}: RenameGroupModalProps) {
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
      title="모임 설정"
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
      {/* 위험 동작이지만 확인 다이얼로그(warn 버튼)가 한 번 더 뜨므로 여기선 secondary로 톤을 낮춘다 */}
      <Button
        variant="secondary"
        fullWidth
        onClick={onDeleteRequest}
        disabled={submitting}
        className="mt-2.5 text-warn"
      >
        모임 삭제
      </Button>
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
