import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { ButtonLink, EmptyState, Header, LoadState } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { listGroups } from '../api/groups'
import { listGroupEvents } from '../api/events'
import { formatEventDate } from '../lib/eventDate'

/**
 * 18. 학부모 모임 상세 (ACTIVE PARENT) · node 307:26 · CHMO-448
 * GET /groups(모임명·myMembership — 상세 응답엔 멤버십이 없어 목록에서 읽는다) +
 * GET /groups/:id/events(PARENT엔 published + **아이 등장 이벤트만** 서버 필터 — 노출 강화,
 * FE는 받은 대로 렌더. 미연결이면 서버가 0개를 주므로 빈 상태 문구만 연결 여부로 가른다).
 * 카드는 와이어프레임 그대로 텍스트만(커버 없음 — 확정) · 상태 배지 없음(전부 공개된 이벤트).
 * 자녀 이름은 myMembership.linkedChildNames(연결 인물명 — 초안 확장) — 미연결이면 "학부모"만.
 */
export function ParentGroupPage() {
  const { groupId = '' } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const groupsApi = useApi('groups', listGroups)
  const eventsApi = useApi(`parent-group-events:${groupId}`, (signal) =>
    listGroupEvents(groupId, signal),
  )

  const group = groupsApi.data?.find((g) => String(g.id) === groupId) ?? null
  const membership = group?.myMembership
  const events = eventsApi.data ?? []

  // role 분기 안전망 — 홈 카드가 분기하지만 딥링크·새로고침으로 직접 와도 제자리로 보낸다
  if (group && (!membership || membership.role === 'teacher'))
    return <Navigate to={`/groups/${groupId}`} replace />
  if (membership?.status === 'pending') return <Navigate to="/home" replace />

  const linkedNames = membership?.linkedChildNames ?? []
  const subtitle = linkedNames.length > 0 ? `학부모 · ${linkedNames.join(', ')}` : '학부모'

  return (
    <PhoneShell>
      <Header backTo="/home" backLabel="홈" title="모임 상세" />
      <main className="flex flex-1 flex-col overflow-y-auto px-5 pb-safe-9 pt-5">
        {group ? (
          <>
            <h2 className="truncate text-xl font-bold text-text">{group.name}</h2>
            <p className="mt-1 text-[13px] text-muted">{subtitle}</p>

            <div className="mt-5 flex flex-1 flex-col">
              {eventsApi.loading || eventsApi.error ? (
                <LoadState
                  loading={eventsApi.loading}
                  error={eventsApi.error}
                  loadingText="공개된 이벤트를 불러오는 중…"
                  onRetry={eventsApi.refetch}
                  unauthorizedTo="/login"
                  notFoundTo="/home"
                  notFoundLabel="홈으로"
                />
              ) : events.length === 0 ? (
                <EmptyState
                  title="아직 볼 수 있는 이벤트가 없어요"
                  description={
                    linkedNames.length > 0 ? (
                      <>
                        아이가 나온 사진이 공개되면
                        <br />
                        여기에서 볼 수 있어요.
                      </>
                    ) : (
                      // 미연결(승인 후 기본 경로 §2) — 연결 전엔 서버가 이벤트를 주지 않는다
                      <>
                        선생님이 아이를 연결하면
                        <br />
                        아이가 나온 이벤트가 보여요.
                      </>
                    )
                  }
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {events.map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/parent/groups/${groupId}/events/${event.id}`)}
                        className="w-full rounded-2xl border border-border bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
                      >
                        <span className="block truncate text-base font-bold text-text">
                          {event.name}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {formatEventDate(event.date)} · 사진 {event.photoCount}장
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : groupsApi.data ? (
          // 목록에 없는 모임 — 삭제됐거나 내 모임이 아니다(멤버십 판정 근거가 목록뿐이라 404 취급)
          <EmptyState
            title="모임을 찾을 수 없어요"
            description={
              <>
                모임이 삭제됐거나
                <br />
                참여 중인 모임이 아니에요.
              </>
            }
            action={<ButtonLink to="/home">홈으로</ButtonLink>}
          />
        ) : (
          <LoadState
            loading={groupsApi.loading}
            error={groupsApi.error}
            loadingText="모임을 불러오는 중…"
            onRetry={groupsApi.refetch}
            unauthorizedTo="/login"
          />
        )}
      </main>
    </PhoneShell>
  )
}
