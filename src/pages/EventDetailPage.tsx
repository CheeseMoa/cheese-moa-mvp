import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { ScreenStub, StubLink } from '../components/ScreenStub'
import { Button, EventStatusBadge, Header } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { toErrorMessage } from '../lib/api'
import type { EventItem, Group } from '../types/api'

/**
 * 이벤트 상세 진입점 — 이벤트 상태로 화면을 분기한다(GET /events/:id).
 * - empty → 06-E 빈 이벤트(node 211:1572): 📷 빈 상태 + [사진 업로드]→06-U
 * - analyzing → 분석중: 자동 폴링 없음(MVP) — 재진입/[분석 완료 확인] 버튼으로 상태 확인
 * - review/ready/published → 08 앨범 그리드(node 211:1619) — 실 UI는 CHMO-114, 지금은 스텁
 */
export function EventDetailPage() {
  const { groupId = '', eventId = '' } = useParams<{ groupId: string; eventId: string }>()
  const navigate = useNavigate()
  const eventApi = useApi<EventItem>(`/events/${eventId}`)
  // 헤더 뒤로가기 라벨(‹ 모임명)용 — 실패해도 화면은 기본 라벨로 동작
  const groupApi = useApi<Group>(`/groups/${groupId}`)

  // 401 = 토큰 무효(apiFetch가 이미 지움) — 재시도해도 영원히 실패하므로 로그인으로 복귀
  if (eventApi.error?.status === 401 || groupApi.error?.status === 401)
    return <Navigate to="/login" replace />

  const event = eventApi.data
  const base = `/groups/${groupId}/events/${eventId}`

  // 08. 이벤트 상세 = 앨범 그리드 — CHMO-114에서 실 UI로 대체(분석 완료 시 여기로 자연 전환)
  if (event && event.status !== 'empty' && event.status !== 'analyzing') {
    return (
      <ScreenStub
        code="08"
        title="이벤트 상세"
        node="211:1619"
        subtitle={`${event.name} · 앨범 그리드(검수 허브) — 실 UI는 CHMO-114`}
      >
        <StubLink to={`${base}/albums/alb_1`}>앨범 상세 예시 (09)</StubLink>
        <StubLink to={`${base}/upload`}>＋ 사진 추가 / 업로드 (06-U)</StubLink>
        <StubLink to={`${base}/publish`}>공개 전 검수 (14)</StubLink>
        <StubLink to={`/groups/${groupId}`}>← 모임 상세 (05)</StubLink>
      </ScreenStub>
    )
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
