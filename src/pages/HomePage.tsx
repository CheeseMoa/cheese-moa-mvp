import { Link, useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { ButtonLink, EmptyState, GroupCard, Header, LoadState, useToast } from '../components/ui'
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
 *
 * 승인제가 role 무관으로 통일되면서(CHMO-475) **선생님 신청도 이 대기 카드로 온다** — 자녀
 * 이름이 없는 대기 항목이 생겼고, 실 BE가 대기 항목에 eventCount 0을 실어 주므로 카드가
 * 카운트로 폴백하지 않도록 GroupCard가 pending일 때 카운트 줄을 잠근다.
 *
 * 둘러보기(00-T)의 첫 로그인 자동 노출은 폐지됐다(CHMO-565 — CHMO-504 반전): 첫 로그인은
 * 아무것도 덮지 않는 내 홈이고, 안내는 앨범 그리드의 코치 힌트가 그 자리에서 1회 맡는다.
 * 둘러보기는 설정에서만 연다.
 */
export function HomePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data, error, loading, refetch } = useApi('groups', listGroups)

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

        {/* 섹션 라벨은 크기·자간이 만든다(CHMO-513) — Jua는 굵기가 한 벌이라 바로 위
            서브텍스트(13px muted)와 굵기로는 갈라지지 않는다 */}
        <h3 className="mt-5 text-[12px] tracking-[0.06em] text-muted">모임</h3>
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
              // 참여 안내를 붙이지 않는다(CHMO-513) — 모임 참여는 링크로만 이뤄지고 홈에는
              // 그 경로가 없다. 종전 "초대받은 모임에 참여해 보세요"는 앱 안에 방법이 없어
              // 사실과 달라졌다
              description="첫 모임을 만들어 보세요."
              // 둘러보기 버튼은 두지 않는다 — 여는 경로는 설정 한 곳으로 모은다(2026-07-29,
              // CHMO-565에서 자동 노출을 폐지하며 홈 링크 복구안도 기각하고 유지한 결정)
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

          {/* 하단은 [＋ 모임 만들기] 하나뿐이다(CHMO-513) — 모임 참여는 링크로만 이뤄진다:
              받은 링크를 누르면 02-1(선생님)·02-2(학부모)로 곧장 들어가므로 홈에서 참여 코드를
              손으로 넣는 문은 닫았다. 링크 진입 화면과 02-1 모달 자체는 그대로 산다 */}
          <div className="mt-auto pt-6">
            <ButtonLink to="/groups/new" fullWidth>
              ＋ 모임 만들기
            </ButtonLink>
          </div>
        </div>
      </main>
    </PhoneShell>
  )
}
