import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { JoinGroupModal } from '../components/JoinGroupModal'
import {
  Button,
  ButtonLink,
  EmptyState,
  GroupCard,
  Header,
  LoadState,
  useToast,
} from '../components/ui'
import { useApi } from '../hooks/useApi'
import { listGroups } from '../api/groups'

/**
 * 02. 홈 / 내 모임 · node 211:1357(목록) · 211:1396(빈 상태) · 337:4(승인 대기) · GET /groups.
 * 관리자 배지·📌 고정은 MVP 미표시(screen-spec §5 미확정).
 * 카드 내 모임 설정 ⚙도 미표시 확정 — 모임 설정은 모임 상세(05)의 ⚙로 일원화(screen-spec 02).
 *
 * 학부모 전환(CHMO-445) — 카드가 myMembership을 소비한다: PENDING은 비활성 대기 카드
 * (배지 + "신청: {자녀}" + 탭 시 토스트 — §7-2 확정: 대기 전용 화면 없음, 모임 API 추가 호출
 * 없음), ACTIVE PARENT는 "학부모 · 참여 중" 서브텍스트. myMembership이 없는 응답
 * (구계약 실 BE)은 기존 제작자 카드 그대로다.
 */
export function HomePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data, error, loading, refetch } = useApi('groups', listGroups)
  const [joinOpen, setJoinOpen] = useState(false)
  const groups = data ?? []

  return (
    <PhoneShell>
      <Header
        right={
          <Link to="/settings" aria-label="설정" className="text-lg text-muted">
            ⚙
          </Link>
        }
      />
      <main className="flex flex-1 flex-col overflow-y-auto px-5 pb-safe-9 pt-5">
        <h2 className="text-xl font-bold text-text">내 모임</h2>
        <p className="mt-1 text-[13px] text-muted">참여 중인 모임을 확인하세요</p>

        <h3 className="mt-5 text-[13px] font-bold text-muted">모임</h3>
        <div className="mt-2 flex flex-1 flex-col">
          {loading || error ? (
            <LoadState
              loading={loading}
              error={error}
              loadingText="모임을 불러오는 중…"
              onRetry={refetch}
              unauthorizedTo="/login"
            />
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
              {groups.map((g) => {
                const membership = g.myMembership
                const pending = membership?.status === 'pending'
                return (
                  <li key={g.id}>
                    <GroupCard
                      name={g.name}
                      memberCount={g.memberCount}
                      eventCount={g.eventCount}
                      pending={pending}
                      subtitle={
                        pending
                          ? membership && membership.claimedChildNames.length > 0
                            ? `신청: ${membership.claimedChildNames.join(', ')}`
                            : undefined
                          : membership?.role === 'parent'
                            ? '학부모 · 참여 중'
                            : undefined
                      }
                      onClick={() => {
                        // PENDING은 모임 API를 추가 호출하지 않는다(§7-2 — 목록 응답 하나로
                        // 끝): 상세로 보내지 않고 안내 토스트만
                        if (pending) toast.show('선생님 승인을 기다리고 있어요')
                        else navigate(`/groups/${g.id}`)
                      }}
                    />
                  </li>
                )
              })}
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

      <JoinGroupModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        // 신청(PENDING) 생성 후 목록을 다시 불러 새 모임 카드가 바로 보이게(CHMO-444)
        onJoined={() => {
          setJoinOpen(false)
          refetch()
        }}
      />
    </PhoneShell>
  )
}
