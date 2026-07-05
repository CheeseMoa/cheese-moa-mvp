import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { JoinGroupModal } from '../components/JoinGroupModal'
import { Button, ButtonLink, EmptyState, GroupCard, Header } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { toErrorMessage } from '../lib/api'
import type { Group } from '../types/api'

/**
 * 02. 홈 / 내 모임 · node 211:1357(목록) · 211:1396(빈 상태) · GET /groups.
 * 관리자 배지·📌 고정은 MVP 미표시(screen-spec §5 미확정).
 * 카드 내 모임 설정 ⚙도 미표시 확정 — 모임 설정은 모임 상세(05)의 ⚙로 일원화(screen-spec 02).
 */
export function HomePage() {
  const navigate = useNavigate()
  const { data, error, loading, refetch } = useApi<{ groups: Group[] }>('/groups')
  const [joinOpen, setJoinOpen] = useState(false)
  const groups = data?.groups ?? []

  // 401 = 토큰 무효(apiFetch가 이미 지움) — 재시도해도 영원히 실패하므로 로그인으로 복귀
  if (error?.status === 401) return <Navigate to="/login" replace />

  return (
    <PhoneShell>
      <Header
        right={
          <Link to="/settings" aria-label="설정" className="text-lg text-muted">
            ⚙
          </Link>
        }
      />
      <main className="flex flex-1 flex-col px-5 pb-9 pt-5">
        <h2 className="text-xl font-bold text-text">내 모임</h2>
        <p className="mt-1 text-[13px] text-muted">참여 중인 모임을 확인하세요</p>

        <h3 className="mt-5 text-[13px] font-bold text-muted">모임</h3>
        <div className="mt-2 flex flex-1 flex-col">
          {loading ? (
            <p className="py-11 text-center text-sm text-muted">모임을 불러오는 중…</p>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-11">
              <p className="text-center text-sm text-warn">{toErrorMessage(error)}</p>
              <Button size="sm" variant="secondary" onClick={refetch}>
                다시 시도
              </Button>
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              title="아직 모임이 없어요"
              description={
                <>
                  첫 모임을 만들거나
                  <br />
                  초대받은 모임에 참여해 보세요.
                </>
              }
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {groups.map((g) => (
                <li key={g.id}>
                  <GroupCard
                    name={g.name}
                    memberCount={g.memberCount}
                    eventCount={g.eventCount}
                    onClick={() => navigate(`/groups/${g.id}`)}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto flex flex-col gap-3 pt-6">
            <ButtonLink to="/groups/new" fullWidth>
              ＋ 모임 만들기
            </ButtonLink>
            <Button variant="secondary" fullWidth onClick={() => setJoinOpen(true)}>
              모임 참여하기
            </Button>
          </div>
        </div>
      </main>

      <JoinGroupModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </PhoneShell>
  )
}
