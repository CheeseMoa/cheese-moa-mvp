import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { RenameModal } from '../components/RenameModal'
import { AlbumCard, Button, EventStatusBadge, Header, LoadState } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { toErrorMessage } from '../api/client'
import { getGroup } from '../api/groups'
import { getEvent, listEventAlbums, renameEvent } from '../api/events'
import type { EventItem } from '../types/api'

/**
 * 이벤트 상세 진입점 — 이벤트 상태로 화면을 분기한다(GET /events/:id).
 * - empty → 06-E 빈 이벤트(node 211:1572): 📷 빈 상태 + [사진 업로드]→06-U
 * - analyzing → 분석중: 5초 간격 자동 폴링(MVP) — 완료되면 앨범 그리드로 자연 전환
 * - review/ready/published → 08 앨범 그리드(EventAlbumGrid, node 211:1619)
 */
export function EventDetailPage() {
  const { groupId = '', eventId = '' } = useParams<{ groupId: string; eventId: string }>()
  const navigate = useNavigate()
  const eventApi = useApi(`event:${eventId}`, (signal) => getEvent(eventId, signal))
  const event = eventApi.data
  // 뒤로가기 '‹ 모임명'은 빈/분석중 분기에서만 쓰인다(08 그리드는 '이벤트 목록' 고정).
  // 그리드 이벤트에선 group 요청을 아예 보내지 않는다 — 불필요한 라운드트립 제거
  const needsGroupName = !!event && (event.status === 'empty' || event.status === 'analyzing')
  const groupApi = useApi(needsGroupName ? `group:${groupId}` : null, (signal) =>
    getGroup(groupId, signal),
  )

  // 분석중 자동 폴링(MVP) — 5초마다 상태를 다시 확인하고, 완료되면 앨범 그리드로 자연 전환.
  // 폴링 실패해도 인터벌은 유지되므로 일시적 네트워크 오류는 다음 주기에 회복된다.
  const analyzing = event?.status === 'analyzing'
  useEffect(() => {
    if (!analyzing) return
    const timer = setInterval(eventApi.refetch, 5000)
    return () => clearInterval(timer)
  }, [analyzing, eventApi.refetch])

  // 보조 fetch(모임명)의 401은 ErrorState를 거치지 않아 여기서 직접 복귀시킨다
  // (eventApi 401은 아래 ErrorState unauthorizedTo가 처리)
  if (groupApi.error?.status === 401) return <Navigate to="/login" replace />

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
                {/* 분석중 — 5초 자동 폴링(위 effect). 완료되면 앨범 그리드로 자연 전환 */}
                <div className="mt-4 flex flex-col items-center rounded-[20px] bg-surface px-8 py-16 text-center">
                  <span aria-hidden className="animate-pulse text-4xl">
                    🤖
                  </span>
                  <p className="mt-3 font-display text-[19px] text-heading">
                    AI가 사진을 분류하고 있어요
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">
                    완료되면 아이별 앨범이 자동으로 열려요.
                    <br />
                    잠시만 기다려 주세요.
                  </p>
                  {/* 폴링 refetch 실패는 stale 데이터 때문에 아래 에러 분기에 못 가므로 여기서 직접 보여준다 */}
                  {eventApi.error ? (
                    <p role="alert" className="mt-4 text-sm text-warn">
                      {toErrorMessage(eventApi.error)}
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </>
        ) : (
          <LoadState
            loading={eventApi.loading}
            error={eventApi.error}
            loadingText="이벤트를 불러오는 중…"
            onRetry={eventApi.refetch}
            unauthorizedTo="/login"
            notFoundTo={`/groups/${groupId}`}
            notFoundLabel="모임 상세로"
          />
        )}
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
 * (인물 앨범 이름수정은 09 앨범 상세 헤더 ✎ — 08 그리드엔 진입점 없음)
 */
function EventAlbumGrid({ event, groupId, onEventUpdated }: EventAlbumGridProps) {
  const navigate = useNavigate()
  const albumsApi = useApi(`event-albums:${event.id}`, (signal) =>
    listEventAlbums(event.id, signal),
  )
  const [renameOpen, setRenameOpen] = useState(false)

  const base = `/groups/${groupId}/events/${event.id}`

  const albums = albumsApi.data ?? []
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

          {albumsApi.loading || albumsApi.error ? (
            <LoadState
              loading={albumsApi.loading}
              error={albumsApi.error}
              loadingText="앨범을 불러오는 중…"
              onRetry={albumsApi.refetch}
              unauthorizedTo="/login"
              notFoundTo={`/groups/${groupId}`}
              notFoundLabel="모임 상세로"
            />
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

      <RenameModal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="이벤트 이름 수정"
        label="이벤트 이름"
        placeholder="예) 6.15 운동회 오전"
        initialName={event.name}
        submit={(name) => renameEvent(event.id, name)}
        successMessage="🧀 이벤트 이름을 바꿨어요"
        onRenamed={onEventUpdated}
      />
    </PhoneShell>
  )
}
