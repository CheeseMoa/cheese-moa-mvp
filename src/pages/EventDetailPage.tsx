import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import {
  AlbumCard,
  Button,
  EventStatusBadge,
  Header,
  Modal,
  TextField,
  useToast,
} from '../components/ui'
import { useApi } from '../hooks/useApi'
import { apiFetch, ApiRequestError, toErrorMessage } from '../lib/api'
import type { Album, EventItem, Group } from '../types/api'

/**
 * 이벤트 상세 진입점 — 이벤트 상태로 화면을 분기한다(GET /events/:id).
 * - empty → 06-E 빈 이벤트(node 211:1572): 📷 빈 상태 + [사진 업로드]→06-U
 * - analyzing → 분석중: 자동 폴링 없음(MVP) — 재진입/[분석 완료 확인] 버튼으로 상태 확인
 * - review/ready/published → 08 앨범 그리드(EventAlbumGrid, node 211:1619)
 */
export function EventDetailPage() {
  const { groupId = '', eventId = '' } = useParams<{ groupId: string; eventId: string }>()
  const navigate = useNavigate()
  const eventApi = useApi<EventItem>(`/events/${eventId}`)
  const event = eventApi.data
  // 뒤로가기 '‹ 모임명'은 빈/분석중 분기에서만 쓰인다(08 그리드는 '이벤트 목록' 고정).
  // 그리드 이벤트에선 group 요청을 아예 보내지 않는다 — 불필요한 라운드트립 제거
  const needsGroupName = !!event && (event.status === 'empty' || event.status === 'analyzing')
  const groupApi = useApi<Group>(needsGroupName ? `/groups/${groupId}` : null)

  // 401 = 토큰 무효(apiFetch가 이미 지움) — 재시도해도 영원히 실패하므로 로그인으로 복귀
  if (eventApi.error?.status === 401 || groupApi.error?.status === 401)
    return <Navigate to="/login" replace />

  const base = `/groups/${groupId}/events/${eventId}`

  // 08. 이벤트 상세 = 앨범 그리드(검수 허브) — 분석 완료 시 여기로 자연 전환
  if (event && event.status !== 'empty' && event.status !== 'analyzing') {
    return <EventAlbumGrid event={event} groupId={groupId} onEventUpdated={eventApi.refetch} />
  }

  return (
    <PhoneShell>
      <Header backTo={`/groups/${groupId}`} backLabel={groupApi.data?.name ?? '모임 상세'} />
      <main className="flex flex-1 flex-col px-5 pb-9 pt-5">
        {event ? (
          <>
            <div className="flex items-center justify-between gap-2.5">
              <h1 className="min-w-0 truncate text-xl font-bold text-text">{event.name}</h1>
              <EventStatusBadge status={event.status} />
            </div>

            {event.status === 'empty' ? (
              <>
                {/* 06-E. 빈 이벤트 — 사진 없는 이벤트의 초기 화면 */}
                <div className="mt-4 flex flex-col items-center rounded-[20px] bg-surface px-8 py-16 text-center">
                  <span aria-hidden className="text-4xl">
                    📷
                  </span>
                  <p className="mt-3 text-sm text-muted">아직 사진이 없어요</p>
                </div>
                <div className="mt-auto pt-6">
                  <Button fullWidth onClick={() => navigate(`${base}/upload`)}>
                    사진 업로드
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* 분석중 — 진행률 %·자동 폴링 없음(MVP). 완료는 재진입/버튼으로 확인 */}
                <div className="mt-4 flex flex-col items-center rounded-[20px] bg-surface px-8 py-16 text-center">
                  <span aria-hidden className="text-4xl">
                    🤖
                  </span>
                  <p className="mt-3 font-display text-[19px] text-heading">
                    AI가 사진을 분류하고 있어요
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">
                    완료되면 아이별 앨범이 만들어져요.
                    <br />
                    잠시 후 아래 버튼으로 확인해 주세요.
                  </p>
                </div>
                <div className="mt-auto pt-6">
                  {/* refetch 실패는 stale 데이터 때문에 아래 에러 분기에 못 가므로 여기서 직접 보여준다 */}
                  {eventApi.error ? (
                    <p role="alert" className="mb-3 text-center text-sm text-warn">
                      {toErrorMessage(eventApi.error)}
                    </p>
                  ) : null}
                  <Button
                    variant="secondary"
                    fullWidth
                    disabled={eventApi.loading}
                    onClick={eventApi.refetch}
                  >
                    {eventApi.loading ? '확인 중…' : '분석 완료 확인'}
                  </Button>
                </div>
              </>
            )}
          </>
        ) : eventApi.loading ? (
          <p className="py-11 text-center text-sm text-muted">이벤트를 불러오는 중…</p>
        ) : eventApi.error ? (
          <div className="flex flex-col items-center gap-3 py-11">
            <p className="text-center text-sm text-warn">{toErrorMessage(eventApi.error)}</p>
            <Button size="sm" variant="secondary" onClick={eventApi.refetch}>
              다시 시도
            </Button>
          </div>
        ) : null}
      </main>
    </PhoneShell>
  )
}

interface EventAlbumGridProps {
  event: EventItem
  groupId: string
  /** 이벤트명 수정 후 이벤트 상세 갱신(refetch) */
  onEventUpdated: () => void
}

/**
 * 08. 이벤트 상세 = 앨범 그리드 · node 211:1619
 * 분석 완료 상태의 검수 허브. ① 인물·공통·분류어려움 = 3열 메인 그리드(커버+검토 테두리/배지) ·
 * ② 품질 제외(눈감음/흔들림) = 하단 별도 섹션 · 범례. 이벤트명 ✎ 수정(PATCH /events/:id) ·
 * [+ 사진 추가]→06-U · [공개 전 검수]→14. 앨범 탭 → 09 앨범 상세.
 * (인물 앨범 이름수정 UI는 후속 스토리 — 이번은 이벤트명 수정만)
 */
function EventAlbumGrid({ event, groupId, onEventUpdated }: EventAlbumGridProps) {
  const navigate = useNavigate()
  const albumsApi = useApi<{ albums: Album[] }>(`/events/${event.id}/albums`)
  const [renameOpen, setRenameOpen] = useState(false)

  // 401 = 토큰 무효(apiFetch가 이미 지움) — 앨범 fetch도 로그인으로 복귀시킨다.
  // (없으면 토큰 없는 [다시 시도]가 영원히 401 — 형제 화면 09·이름수정 모달과 동일 처리)
  if (albumsApi.error?.status === 401) return <Navigate to="/login" replace />

  const base = `/groups/${groupId}/events/${event.id}`

  const albums = albumsApi.data?.albums ?? []
  // 스펙 08: ① 인물/공통/분류어려움 메인 그리드 · ② 품질 제외(눈감음/흔들림) 하단 별도 섹션
  const mainAlbums = albums.filter((a) => a.type !== 'eyes_closed' && a.type !== 'blurry')
  const qualityAlbums = albums.filter((a) => a.type === 'eyes_closed' || a.type === 'blurry')

  return (
    <PhoneShell>
      <Header backTo={`/groups/${groupId}`} backLabel="이벤트 목록" title="이벤트 상세" />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 앨범이 많아 프레임(844)을 넘을 수 있어 그리드는 스크롤, 하단 액션은 고정 */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-5">
          <div className="flex items-center gap-2.5">
            <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-heading">{event.name}</h1>
            <button
              type="button"
              onClick={() => setRenameOpen(true)}
              className="inline-flex flex-none items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-bold text-accent"
            >
              ✎ 수정
            </button>
          </div>

          {albumsApi.loading ? (
            <p className="py-11 text-center text-sm text-muted">앨범을 불러오는 중…</p>
          ) : albumsApi.error ? (
            <div className="flex flex-col items-center gap-3 py-11">
              <p className="text-center text-sm text-warn">{toErrorMessage(albumsApi.error)}</p>
              <Button size="sm" variant="secondary" onClick={albumsApi.refetch}>
                다시 시도
              </Button>
            </div>
          ) : albums.length === 0 ? (
            <p className="py-11 text-center text-sm text-muted">앨범이 아직 없어요.</p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {mainAlbums.map((album) => (
                  <AlbumCard
                    key={album.id}
                    album={album}
                    coverUrl={album.coverThumbnailUrl ?? undefined}
                    onClick={() => navigate(`${base}/albums/${album.id}`)}
                  />
                ))}
              </div>

              {qualityAlbums.length > 0 && (
                <section className="mt-6">
                  <h2 className="text-[13px] font-bold text-muted">품질 제외</h2>
                  <div className="mt-2 grid grid-cols-3 gap-2.5">
                    {qualityAlbums.map((album) => (
                      <AlbumCard
                        key={album.id}
                        album={album}
                        coverUrl={album.coverThumbnailUrl ?? undefined}
                        onClick={() => navigate(`${base}/albums/${album.id}`)}
                      />
                    ))}
                  </div>
                </section>
              )}

              <p className="mt-4 text-[11px] text-muted">
                테두리: 갈색=검토완료 · 회색 점선=미검토
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 px-5 pb-9 pt-4">
          <Button variant="secondary" fullWidth onClick={() => navigate(`${base}/upload`)}>
            ＋ 사진 추가
          </Button>
          <Button fullWidth onClick={() => navigate(`${base}/publish`)}>
            공개 전 검수
          </Button>
        </div>
      </main>

      <RenameEventModal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        event={event}
        onRenamed={onEventUpdated}
      />
    </PhoneShell>
  )
}

interface RenameEventModalProps {
  open: boolean
  onClose: () => void
  event: EventItem
  /** PATCH 성공 후 상세 갱신(refetch) */
  onRenamed: () => void
}

/** 이벤트명 수정(✎) · PATCH /events/:id — 08 상단 ✎ 수정 */
function RenameEventModal({ open, onClose, event, onRenamed }: RenameEventModalProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState(event.name)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 최신 이름은 ref로만 읽는다 — 열린 모달의 입력을 뒤늦은 refetch가 덮어쓰지 않게.
  // 단 렌더-거울(매 렌더 대입)은 저장 성공~refetch 도착 사이 stale prop을 재시드하므로,
  // prop이 실제 바뀔 때만 동기화하고 저장 성공 시엔 직접 갱신한다(재오픈 시 되돌림 방지).
  const eventNameRef = useRef(event.name)
  useEffect(() => {
    eventNameRef.current = event.name
  }, [event.name])

  // 닫힘→열림 전환에만 현재 이름으로 초기화(이전 입력·에러가 남지 않게)
  useEffect(() => {
    if (!open) return
    setName(eventNameRef.current)
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
      await apiFetch<EventItem>(`/events/${event.id}`, {
        method: 'PATCH',
        body: { name: nextName },
      })
      if (!alive.current) return
      // 성공 반영 — refetch 도착 전 재오픈해도 새 이름이 보이게(stale prop 재시드 방지)
      eventNameRef.current = nextName
      toast.show('🧀 이벤트 이름을 바꿨어요')
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
      title="이벤트 이름 수정"
    >
      <form onSubmit={handleSubmit} noValidate className="mt-3.5 flex flex-col gap-3.5">
        <TextField
          label="이벤트 이름"
          placeholder="예) 6.15 운동회 오전"
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
