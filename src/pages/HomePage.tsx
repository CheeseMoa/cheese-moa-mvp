import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { AppTour } from '../components/AppTour'
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
import { getPreferredTourTrack, hasSeenOnboarding, markOnboardingSeen } from '../lib/onboarding'

/**
 * 02. 홈 / 내 모임 · node 211:1357(목록) · 211:1396(빈 상태) · 337:4(승인 대기) · GET /groups.
 * 관리자 배지·📌 고정은 MVP 미표시(screen-spec §5 미확정).
 * 카드 내 모임 설정 ⚙도 미표시 확정 — 모임 설정은 모임 상세(05)의 ⚙로 일원화(screen-spec 02).
 *
 * 학부모 전환(CHMO-445) — 카드가 myMembership을 소비한다: PENDING은 비활성 대기 카드
 * (배지 + "신청: {자녀}" + 탭 시 토스트 — §7-2 확정: 대기 전용 화면 없음, 모임 API 추가 호출
 * 없음), ACTIVE PARENT는 "학부모 · 참여 중" 서브텍스트. myMembership이 없는 응답
 * (구계약 실 BE)은 기존 제작자 카드 그대로다.
 *
 * 승인제가 role 무관으로 통일되면서(CHMO-475) **선생님 신청도 이 대기 카드로 온다** — 자녀
 * 이름이 없는 대기 항목이 생겼고, 실 BE가 대기 항목에 eventCount 0을 실어 주므로 카드가
 * 카운트로 폴백하지 않도록 GroupCard가 pending일 때 카운트 줄을 잠근다.
 */
/** 홈으로 보낼 때 실리는 신호 — 참여 흐름(02-1·02-2)과 온보딩 슬라이드가 쓴다 */
interface HomeLocationState {
  /** 온보딩 슬라이드의 '초대 코드로 참여하기' — 도착 즉시 02-1 모달을 연다 */
  openJoin?: boolean
  /** 초대 링크 참여 흐름의 끝 — 이 방문에는 둘러보기를 열지 않는다 */
  fromJoin?: boolean
}

export function HomePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data, error, loading, refetch } = useApi('groups', listGroups)
  const location = useLocation()
  const homeState = location.state as HomeLocationState | null
  // 온보딩 마지막 장의 '초대 코드로 참여하기'가 넘기는 신호(CHMO-481) — 홈에 도착하자마자 02-1을 연다
  const [joinOpen, setJoinOpen] = useState(Boolean(homeState?.openJoin))
  // 첫 로그인 1회 자동 노출(CHMO-504) — 로그인 후 별도 화면으로 튕기지 않고 홈 위에서 연다.
  //
  // 참여 흐름의 끝(fromJoin)에서는 한 박자 미룬다. 초대 링크를 받은 사람이 홈에 도착한 이유는
  // "앱을 처음 열었다"가 아니라 "참여 신청을 막 끝냈다"다 — 그 자리에 투어를 띄우면 신청 완료
  // 토스트와 승인 대기 카드를 덮고, 자녀 이름까지 적어 넣은 사람에게 첫 장이 다시 "어느 쪽으로
  // 오셨나요?"를 묻는다. 플래그는 소진하지 않으므로 **다음 홈 방문에 뜬다**(안내를 아예 못 보는
  // 사람은 생기지 않는다). 종전 !joinOpen 가드가 이걸 노렸지만 openJoin 신호를 보내는 곳이
  // 노출 중단된 온보딩 슬라이드뿐이라 실제 초대 흐름에는 걸리지 않았다.
  const [tourOpen, setTourOpen] = useState(
    () => !joinOpen && !homeState?.fromJoin && !hasSeenOnboarding(),
  )
  // 초대 링크가 밝혀 준 갈래로 열어 역할 질문을 건너뛴다 — 없으면 첫 장에서 직접 고른다
  const [tourTrack] = useState(getPreferredTourTrack)

  // 자동 노출은 '떴다'는 사실만으로 소진된다(2026-07-29 — 무조건 최초 1회).
  // 닫을 때 기록하면 투어 도중 새로고침·뒤로가기·앱 전환으로 이탈했을 때 다음 홈 방문에
  // 또 떠서 1회 보장이 깨진다. 다시 보려면 설정 → '치즈모아 둘러보기'.
  useEffect(() => {
    if (tourOpen) markOnboardingSeen()
  }, [tourOpen])

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
              // 둘러보기 버튼은 두지 않는다(2026-07-29) — 투어는 무조건 최초 1회만 뜨고,
              // 다시 보는 경로는 설정 한 곳으로 모은다. 여기 두면 모임이 없는 동안 홈에
              // 상시 노출돼 '1회'라는 약속과 어긋난다
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
                          ? // 학부모 신청은 원문(자녀 이름)이 가장 많은 정보를 준다. 선생님 신청은
                            // childNames가 빈 배열이라(CHMO-475) 어떤 자격으로 신청했는지만 밝힌다
                            membership && membership.claimedChildNames.length > 0
                            ? `신청: ${membership.claimedChildNames.join(', ')}`
                            : membership?.role === 'parent'
                              ? '학부모로 참여 신청'
                              : '선생님으로 참여 신청'
                          : membership?.role === 'parent'
                            ? '학부모 · 참여 중'
                            : undefined
                      }
                      onClick={() => {
                        // PENDING은 모임 API를 추가 호출하지 않는다(§7-2 — 목록 응답 하나로
                        // 끝): 상세로 보내지 않고 안내 토스트만
                        if (pending) toast.show('선생님 승인을 기다리고 있어요')
                        // ACTIVE PARENT는 학부모 모임 상세(18)로 — TEACHER·구계약(멤버십 없음)은 기존 05
                        else if (membership?.role === 'parent') navigate(`/parent/groups/${g.id}`)
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
      <AppTour open={tourOpen} onClose={() => setTourOpen(false)} initialTrack={tourTrack} />
    </PhoneShell>
  )
}
