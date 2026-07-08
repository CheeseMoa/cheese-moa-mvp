import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../../components/PhoneShell'
import { Button, EmptyState, Header } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { toErrorMessage } from '../../lib/api'
import type { Group, ViewerEvent } from '../../types/api'

interface ViewerEventsResponse {
  group: Pick<Group, 'id' | 'name'>
  events: ViewerEvent[]
}

/** "2026-06-15" → "6월 15일" (이벤트 카드 메타) — YYYY-MM-DD가 아니면 원문 그대로 */
function formatEventDate(date: string): string {
  const [, month = '', day = ''] = date.split('-')
  const m = parseInt(month, 10)
  const d = parseInt(day, 10)
  if (!Number.isFinite(m) || !Number.isFinite(d)) return date
  return `${m}월 ${d}일`
}

/**
 * 15-L. 공개 이벤트 목록 (뷰어, 무로그인) · GET /share/:token
 * published 이벤트만 서버가 필터해 내려준다(FE는 받은 대로 렌더).
 * 와이어프레임 없는 신규 화면 — 홈형 헤더 + 모임명 + 커버 썸네일 카드 리스트로 확정(screen-spec 15-L).
 */
export function ViewerEventsPage() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const api = useApi<ViewerEventsResponse>(`/share/${token}`, {
    auth: 'viewer',
    viewerShareToken: token,
  })

  // 401 = 뷰어 토큰 무효(apiFetch가 이미 지움) — 잠금 해제 화면으로 복귀
  if (api.error?.status === 401) return <Navigate to={`/share/${token}`} replace />

  const events = api.data?.events ?? []

  return (
    <PhoneShell>
      <Header />
      <main className="flex flex-1 flex-col px-5 pb-9 pt-5">
        {api.data ? (
          <>
            <h2 className="truncate text-xl font-bold text-text">{api.data.group.name}</h2>
            <p className="mt-1 text-[13px] text-muted">공개된 이벤트를 골라 사진을 확인하세요.</p>

            {events.length === 0 ? (
              <EmptyState
                title="아직 공개된 이벤트가 없어요"
                description={
                  <>
                    선생님이 사진을 공개하면
                    <br />
                    여기에서 볼 수 있어요.
                  </>
                }
              />
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {events.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/share/${token}/events/${event.id}`)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-3 text-left shadow-card transition active:scale-[0.99]"
                    >
                      <span className="cheese-dots block h-[76px] w-[76px] shrink-0 overflow-hidden rounded-xl bg-photo">
                        {event.coverThumbnailUrl && (
                          <img
                            src={event.coverThumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-bold text-text">
                          {event.name}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {formatEventDate(event.date)} · 사진 {event.photoCount}장
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : api.loading ? (
          <p className="py-11 text-center text-sm text-muted">공개 이벤트를 불러오는 중…</p>
        ) : api.error ? (
          <div className="flex flex-col items-center gap-3 py-11">
            <p className="text-center text-sm text-warn">{toErrorMessage(api.error)}</p>
            <Button size="sm" variant="secondary" onClick={api.refetch}>
              다시 시도
            </Button>
          </div>
        ) : null}
      </main>
    </PhoneShell>
  )
}
