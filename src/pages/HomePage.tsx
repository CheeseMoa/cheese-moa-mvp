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
import { useEntrance } from '../hooks/useEntrance'
import { listGroups } from '../api/groups'

/**
 * 02. 홈 / 내 모임 · node 211:1357(목록) · 211:1396(빈 상태) · 337:4(승인 대기) · GET /groups.
 * 관리자 배지·📌 고정은 MVP 미표시(screen-spec §5 미확정).
 * 카드 내 모임 설정 ⚙도 미표시 확정 — 모임 설정은 모임 상세(05)의 ⚙로 일원화(screen-spec 02).
 *
 * 학부모 전환(CHMO-445) — 카드가 myMembership을 소비한다: PENDING은 비활성 대기 카드
 * (배지 + "신청: {이름}" + 탭 시 토스트 — §7-2 확정: 대기 전용 화면 없음, 모임 API 추가 호출
 * 없음), ACTIVE VIEWER는 "멤버 · 참여 중" 서브텍스트. myMembership이 없는 응답
 * (구계약 실 BE)은 기존 제작자 카드 그대로다.
 *
 * 승인제가 role 무관으로 통일되면서(CHMO-475) **관리자(EDITOR) 신청도 이 대기 카드로 온다** —
 * 인물 이름이 없는 대기 항목이 생겼고, 실 BE가 대기 항목에 eventCount 0을 실어 주므로 카드가
 * 카운트로 폴백하지 않도록 GroupCard가 pending일 때 카운트 줄을 잠근다. 대기 부연 문구
 * ('선생님으로/학부모로 참여 신청')는 CHMO-608에서 제거 — '승인 대기중' 배지가 이미 상태를 말한다.
 *
 * 유형 분기(CHMO-608 · B2C 360:5) — 카드가 groupType을 소비한다: business만 '비즈니스' 배지
 * + 관리자/멤버 분리 카운트(editorCount/viewerCount), 일반은 배지 없이 "이벤트 N개 · 멤버 N".
 *
 * 둘러보기(00-T)는 삭제됐다(CHMO-578 — 자동 노출 폐지(CHMO-565)를 거쳐 설정 진입점까지 제거):
 * 첫 로그인은 아무것도 덮지 않는 내 홈이고, 안내는 실제 화면의 코치 힌트가 그 자리에서 1회 맡는다.
 *
 * 참여 진입점은 되살아났다(CHMO-672 — CHMO-513 반전). 일반(B2C) 모임은 링크를 받으면 바로
 * 참여하는 구조인데(CHMO-618) 대화방에서는 링크가 아니라 **코드만 구두로 전달되는 일**이 흔하고,
 * 링크를 잃은 사람에게는 앱 안에 들어갈 문이 하나도 없었다.
 */
export function HomePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data, error, loading, refetch } = useApi('groups', listGroups)
  const [joinOpen, setJoinOpen] = useState(false)

  const groups = data ?? []
  // 05 이벤트 목록·08 앨범 그리드와 같은 진입 효과(CHMO-711) — 같은 꼴의 목록은 같게 들어온다
  const groupListRef = useEntrance<HTMLUListElement>(groups.length > 0, 'rise')

  return (
    <PhoneShell>
      <Header
        right={
          <Link to="/settings" aria-label="설정" className="text-lg text-muted">
            ⚙
          </Link>
        }
      />
      {/* 스크롤은 모임 목록만 갖는다(CHMO-530 관용 — CHMO-707) — main은 스크롤 컨테이너가
          아니고(overflow-hidden) 하단 버튼이 shrink-0으로 붙어 목록만 그 사이를 흐른다.
          sticky는 쓰지 않는다(CHMO-424 — 실기기 WebKit 부유 결함) */}
      <main className="flex flex-1 flex-col overflow-hidden px-5 pt-5">
        <h2 className="shrink-0 text-xl font-bold text-text">내 모임</h2>
        <p className="mt-1 shrink-0 text-[13px] text-muted">참여 중인 모임을 확인하세요</p>

        {/* 섹션 라벨은 크기·자간이 만든다 — Jua 단일 굵기 시절(CHMO-513) 규칙이고
            Pretendard 전환(CHMO-702) 뒤에도 유지한다 */}
        <h3 className="mt-5 shrink-0 text-[12px] tracking-[0.06em] text-muted">모임</h3>
        {/* -mx-5 px-5·-mt-2 pt-2·pb-4: 카드 그림자(shadow-card, blur 30)가 스크롤 컨테이너
            가장자리에서 잘리면 카드 폭만큼의 회색 판처럼 보인다 — 번질 여백을 컨테이너
            안쪽으로 되돌려 준다(시각 위치는 동일) */}
        <div className="-mx-5 flex flex-1 flex-col overflow-y-auto px-5 pb-4 pt-2">
          {/* 데이터가 있으면 갱신(refetch·캐시 재검증) 중에도 목록을 유지한다 — 로딩으로
              갈아끼우면 재진입마다 화면이 한 번 비었다 채워진다(CHMO-401) */}
          {data === null ? (
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
              // 참여 안내가 돌아왔다(CHMO-672) — 아래 [모임 참여하기]가 실제 경로라 다시 사실이다
              description={
                <>
                  첫 모임을 만들거나
                  <br />
                  받은 참여 코드로 참여해 보세요.
                </>
              }
            />
          ) : (
            <ul ref={groupListRef} className="flex flex-col gap-3">
              {groups.map((g) => {
                const membership = g.myMembership
                const pending = membership?.status === 'pending'
                return (
                  <li key={g.id}>
                    <GroupCard
                      name={g.name}
                      groupType={g.groupType}
                      memberCount={g.memberCount}
                      editorCount={g.editorCount}
                      viewerCount={g.viewerCount}
                      eventCount={g.eventCount}
                      pending={pending}
                      subtitle={
                        pending
                          ? // 신청 원문(인물 이름)만 남긴다 — '승인 대기중' 배지가 이미 상태를
                            // 말하므로 부연('~로 참여 신청')은 걷어냈다(CHMO-608). 관리자(EDITOR)
                            // 신청은 이름이 없어(빈 배열, CHMO-475) 서브텍스트 없이 배지만 남는다
                            membership && membership.claimedChildNames.length > 0
                            ? `신청: ${membership.claimedChildNames.join(', ')}`
                            : undefined
                          : membership?.role === 'viewer'
                            ? '멤버 · 참여 중'
                            : undefined
                      }
                      onClick={() => {
                        // PENDING은 모임 API를 추가 호출하지 않는다(§7-2 — 목록 응답 하나로
                        // 끝): 상세로 보내지 않고 안내 토스트만
                        if (pending) toast.show('관리자 승인을 기다리고 있어요')
                        // ACTIVE VIEWER는 학부모 모임 상세(18)로 — EDITOR·구계약(멤버십 없음)은 기존 05
                        else if (membership?.role === 'viewer') navigate(`/parent/groups/${g.id}`)
                        else navigate(`/groups/${g.id}`)
                      }}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* 두 버튼은 나란히가 아니라 세로로 쌓는다(CHMO-672) — 390px에서 버튼 하나가 170px인데
            `＋ 모임 만들기`가 이미 그 폭을 거의 채워(05 하단 실측, CHMO-530) 라벨이 잘린다.
            위계는 색이 만든다: 만들기 primary · 참여 secondary */}
        <div className="flex shrink-0 flex-col gap-3 pb-safe-9 pt-4">
          <ButtonLink to="/groups/new" variant="accent" fullWidth>
            ＋ 모임 만들기
          </ButtonLink>
          <Button variant="secondary" fullWidth onClick={() => setJoinOpen(true)}>
            모임 참여하기
          </Button>
        </div>
      </main>

      <JoinGroupModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        // 신청(PENDING)으로 끝나면 홈에 남는다 — 목록을 다시 불러 대기 카드가 바로 보이게(CHMO-444)
        onJoined={() => {
          setJoinOpen(false)
          refetch()
        }}
      />
    </PhoneShell>
  )
}
