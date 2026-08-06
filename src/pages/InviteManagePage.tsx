import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { ChildLinkSheet } from '../components/ChildLinkSheet'
import { GroupInviteLinks } from '../components/GroupInviteLinks'
import {
  Button,
  ConfirmDialog,
  CountBadge,
  EmptyState,
  Header,
  IconClose,
  InlineRetry,
  LoadState,
  useToast,
} from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useMutation } from '../hooks/useMutation'
import { getMe } from '../api/auth'
import {
  getGroup,
  listGroupMembers,
  listJoinRequests,
  removeGroupMember,
  resolveJoinRequest,
  unlinkPersonParent,
} from '../api/groups'
import { formatTimeAgo } from '../lib/timeAgo'
import { UNNAMED_PERSON_LABEL } from '../lib/albumLabels'
import type { GroupMember, GroupRole, ID, JoinRequest, PersonMapping } from '../types/api'

/**
 * 역할 라벨 = 관리자 / 멤버(CHMO-610 — 구 선생님/학부모). role 직렬화 값은 editor/viewer
 * (CHMO-604)이고 초대 채널 키는 teacher/parent 그대로다 — 바뀐 건 화면에 보이는 호칭뿐이다.
 */
const TAB_KEYS: GroupRole[] = ['editor', 'viewer']
const ROLE_LABEL: Record<GroupRole, string> = { editor: '관리자', viewer: '멤버' }
/** 명단·신청이 모두 없을 때 — 링크는 바로 위에 있으니 그걸 가리킨다 */
const EMPTY_COPY: Record<GroupRole, { title: string; description: string }> = {
  editor: {
    title: '아직 관리자가 없어요',
    description: '위 참여 링크를 함께 관리할 사람에게 보내 보세요.',
  },
  viewer: {
    title: '아직 멤버가 없어요',
    description: '위 신청 링크를 멤버에게 보내 보세요.',
  },
}
/** 일반 모임 — 역할이 없어 명단도 한 벌이다 */
const GENERAL_EMPTY_COPY = {
  title: '아직 멤버가 없어요',
  description: '위 초대 링크를 함께할 사람에게 보내 보세요.',
}

/**
 * 20. 초대 · node 363:29(일반)·368:5(비즈니스 멤버 탭) — 05 하단 [초대 관리] 진입(CHMO-447·520·530·610).
 * GET /groups/:id/invite(초대 링크 — GroupInviteLinks) · GET /groups/:id/join-requests(대기 신청) ·
 * PATCH /join-requests/:id(승인/거절 — 승인은 **멤버 확정만**, 인물 연결은 별도 액션 §1) ·
 * GET /groups/:id/members(명단·연결 칩) · DELETE /groups/:id/person-parents(칩 ✕ 해제) ·
 * DELETE /groups/:id/members/:userId(멤버 내보내기 — App Store 1.2 차단 수단, CHMO-526·BE 525.
 * 자기 행("(나)")엔 버튼이 없다 — 같은 API의 본인 대상은 '나가기'라 05 모임 설정이 맡는다).
 * 인물 연결(20-1)은 이 화면 위 바텀시트(ChildLinkSheet)로 뜬다.
 * TEACHER 전용은 서버가 강제(ROLE403·비멤버 404 은닉) — 비정상 진입은 LoadState 에러로 수렴.
 * 기본 탭은 멤버 — 이 화면의 주 업무(신청 승인·인물 연결)가 멤버 쪽이다.
 *
 * 이 화면이 '초대'의 전부다(CHMO-520 — 05-2 통합 시트 흡수·폐지): 한 역할 탭 아래
 * **부르기(초대 링크) → 기다림(대기 신청) → 들어온 사람(명단)** 순으로 한 바퀴가 놓인다.
 * 종전엔 부르기만 05 위 시트에 따로 있었고, 그 시트와 이 화면이 같은 역할 세그먼트 탭을 각자
 * 한 벌씩 갖고 있었다 — 같은 축으로 두 번 가르는 화면이 둘이라는 건 원래 하나였다는 뜻이다.
 * 탭 라벨에 인원 수를 얹지 않는 이유는 바로 아래 섹션 제목이 이미 그 수를 말하기 때문이다.
 *
 * 승인제가 role 무관으로 통일되면서(CHMO-475) 신청 목록에 **관리자 신청도 섞여 온다**
 * (role=EDITOR·childNames 빈 배열 — 원문 줄 없이 닉네임+시각만 렌더된다). 기본 탭이
 * 멤버라 관리자 신청이 묻히지 않게 탭 라벨에 탭별 대기 수를 붙인다.
 *
 * **일반 모임은 라이트 구성이다**(CHMO-610 · B2C 363:29): 역할도 승인도 인물 연결도 없어
 * **초대 링크 + 멤버 명단(내보내기)** 둘만 남고 역할 탭·대기 신청·연결 섹션이 통째로 빠진다.
 * 없는 섹션의 조회도 보내지 않는다 — 비즈니스 전용 API(join-requests·person-parents)는
 * 일반 모임에서 호출 자체가 없다(정책 원천 group-type-proposal §3·§6). 그래서 유형이
 * 도착하기 전에는 본문을 그리지 않는다: 탭 유무가 유형에 달려 있어 먼저 그리면 화면이 뒤집힌다.
 */
export function InviteManagePage() {
  const { groupId = '' } = useParams<{ groupId: string }>()
  const toast = useToast()
  const mutate = useMutation()
  const [tab, setTab] = useState<GroupRole>('viewer')
  // "(나)" 표기용 — 실패해도 명단은 그대로 보여준다(표기만 생략)
  const meApi = useApi('me', getMe)
  // 유형이 화면 구성을 가른다(일반=라이트) — 05에서 이미 읽은 값이지만 캐시가 없어 다시 읽는다
  const groupApi = useApi(`group:${groupId}`, (signal) => getGroup(groupId, signal))
  const group = groupApi.data
  const business = group?.groupType === 'business'
  // 대기 신청은 비즈니스 전용 — 유형 도착 전(null)에도 보내지 않는다(§6 "호출 자체가 없다")
  const requestsApi = useApi(business ? `join-requests:${groupId}` : null, (signal) =>
    listJoinRequests(groupId, signal),
  )
  const membersApi = useApi(`group-members:${groupId}`, (signal) =>
    listGroupMembers(groupId, signal),
  )

  // 신청 승인/거절 — 처리 중인 신청 id(카드 버튼·거절 다이얼로그 공용 busy)
  const [busyRequestId, setBusyRequestId] = useState<ID | null>(null)
  const [rejectTarget, setRejectTarget] = useState<JoinRequest | null>(null)
  // 인물 연결(20-1 시트)·해제(확인 다이얼로그) 대상
  const [linkTarget, setLinkTarget] = useState<GroupMember | null>(null)
  const [unlinkTarget, setUnlinkTarget] = useState<{
    member: GroupMember
    mapping: PersonMapping
  } | null>(null)
  const [unlinking, setUnlinking] = useState(false)
  // 멤버 내보내기(확인 다이얼로그) 대상 — CHMO-526
  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null)
  const [removing, setRemoving] = useState(false)

  const handleResolve = async (request: JoinRequest, decision: 'approved' | 'rejected') => {
    setBusyRequestId(request.id)
    await mutate(() => resolveJoinRequest(request.id, decision), {
      onSuccess: () => {
        toast.show(decision === 'approved' ? '🧀 신청을 승인했어요' : '신청을 거절했어요')
        setBusyRequestId(null)
        setRejectTarget(null)
        requestsApi.refetch()
        // 승인된 신청자는 멤버 명단으로 넘어온다
        if (decision === 'approved') membersApi.refetch()
      },
      onError: (msg) => {
        toast.show(msg)
        setBusyRequestId(null)
        setRejectTarget(null)
      },
    })
  }

  const handleUnlink = async () => {
    if (!unlinkTarget) return
    setUnlinking(true)
    await mutate(
      () =>
        unlinkPersonParent(groupId, {
          userId: unlinkTarget.member.userId,
          personId: unlinkTarget.mapping.personId,
        }),
      {
        onSuccess: () => {
          toast.show('연결을 해제했어요')
          setUnlinking(false)
          setUnlinkTarget(null)
          membersApi.refetch()
        },
        onError: (msg) => {
          toast.show(msg)
          setUnlinking(false)
          setUnlinkTarget(null)
        },
      },
    )
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    setRemoving(true)
    await mutate(() => removeGroupMember(groupId, removeTarget.userId), {
      onSuccess: () => {
        toast.show(`'${removeTarget.nickname}'님을 내보냈어요`)
        setRemoving(false)
        setRemoveTarget(null)
        membersApi.refetch()
      },
      // MEMBER409(내보내기로 선생님이 0명 — 동시 나가기 경쟁, CHMO-564)도 서버 메시지
      // ("모임에는 최소 1명의 선생님이 남아야 합니다.")가 안내로 충분해 그대로 노출한다
      onError: (msg) => {
        toast.show(msg)
        setRemoving(false)
        setRemoveTarget(null)
      },
    })
  }

  const me = meApi.data
  const allRequests = requestsApi.data ?? []
  const requests = allRequests.filter((r) => r.role === tab)
  // 일반 모임은 역할이 없어 명단을 가르지 않는다(전원 editor — 걸러 내면 빈 명단이 된다)
  const members = (membersApi.data ?? []).filter((m) => !business || m.role === tab)
  // 탭별 대기 수 — 기본 탭이 멤버라, 표시가 없으면 관리자 신청이 온 줄 모른다(CHMO-475)
  const pendingCountOf = (role: GroupRole) => allRequests.filter((r) => r.role === role).length
  const emptyCopy = business ? EMPTY_COPY[tab] : GENERAL_EMPTY_COPY

  return (
    <PhoneShell>
      <Header backTo={`/groups/${groupId}`} backLabel="모임" title="초대" />

      {/* 세그먼트 탭 — 스크롤 밖 고정(긴 명단에서도 항상 전환 가능). 일반 모임엔 가를 축이 없다 */}
      {business && (
        <div className="shrink-0 px-5 pt-4">
          <div role="tablist" aria-label="멤버 구분" className="flex rounded-full bg-surface p-1">
            {TAB_KEYS.map((key) => {
              const waiting = pendingCountOf(key)
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  aria-label={
                    waiting > 0 ? `${ROLE_LABEL[key]} · 대기 신청 ${waiting}건` : undefined
                  }
                  onClick={() => setTab(key)}
                  className={`flex-1 rounded-full py-2 text-sm transition ${
                    tab === key ? 'bg-primary font-bold text-text' : 'font-medium text-muted'
                  }`}
                >
                  {ROLE_LABEL[key]}
                  {waiting > 0 && (
                    <span className="ml-1.5">
                      <CountBadge count={waiting} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <main className="flex flex-1 flex-col overflow-y-auto px-5 pb-safe-9 pt-4">
        {!group ? (
          // 유형을 모르면 이 화면의 골격(탭·섹션 구성)이 정해지지 않는다 — 본문을 통째로 맡긴다
          <LoadState
            loading={groupApi.loading}
            error={groupApi.error}
            loadingText="모임을 불러오는 중…"
            onRetry={groupApi.refetch}
            unauthorizedTo="/login"
            notFoundTo="/"
            notFoundLabel="홈으로"
          />
        ) : (
          <>
            {/* ① 부르기 — 멤버 조회 밖에 둔다(CHMO-520). 링크 복사가 이 화면의 첫 번째 일인데,
                명단 조회가 일시 실패했다고 링크까지 못 꺼내면 초대 자체가 막힌다 */}
            <GroupInviteLinks groupId={groupId} role={tab} groupType={group.groupType} />

            {membersApi.data ? (
              <>
                {/* ② 기다림 — 명단보다 위(승인이 먼저 할 일). 조회 실패는 명단을 가리지 않고
                인라인으로만 알린다(05 뱃지 생략과 같은 결 — 단, 관리 화면에선 침묵하지 않는다) */}
                {requestsApi.error ? (
                  <InlineRetry
                    message="신청 목록을 불러오지 못했어요"
                    onRetry={requestsApi.refetch}
                    className="mb-5"
                  />
                ) : requests.length > 0 ? (
                  <section className="mb-5">
                    <h3 className="text-[12px] tracking-[0.06em] text-muted">
                      대기 중인 신청 {requests.length}
                    </h3>
                    <ul className="mt-2 flex flex-col gap-3">
                      {requests.map((request) => (
                        <li
                          key={request.id}
                          className="rounded-2xl border border-border bg-white p-4 shadow-card"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="min-w-0 truncate font-bold text-text">
                              {request.nickname}
                            </p>
                            <span className="shrink-0 text-xs text-muted">
                              {formatTimeAgo(request.createdAt)}
                            </span>
                          </div>
                          {/* 신청자가 적어 낸 인물 이름 — 승인 판단의 유일한 단서다(§2 원문 보존).
                          관리자 신청은 이름이 없어 이 줄이 통째로 빠진다 */}
                          {request.childNames.length > 0 && (
                            <p className="mt-0.5 text-[13px] text-muted">
                              '{request.childNames.join(', ')}' 사진 신청
                            </p>
                          )}
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              disabled={busyRequestId !== null}
                              onClick={() => void handleResolve(request, 'approved')}
                            >
                              {busyRequestId === request.id ? '처리 중…' : '승인'}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busyRequestId !== null}
                              onClick={() => setRejectTarget(request)}
                            >
                              거절
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {/* ③ 들어온 사람 */}
                {members.length > 0 ? (
                  <section>
                    <h3 className="text-[12px] tracking-[0.06em] text-muted">
                      {business ? ROLE_LABEL[tab] : '멤버'} {members.length}
                    </h3>
                    <ul className="mt-2 flex flex-col gap-3">
                      {members.map((member) =>
                        member.role === 'editor' ? (
                          <li
                            key={member.userId}
                            className="flex items-baseline justify-between gap-3 rounded-2xl border border-border bg-white px-4 py-3.5 shadow-card"
                          >
                            <p className="min-w-0 truncate font-bold text-text">
                              {member.nickname}
                              {me && member.userId === me.id ? ' (나)' : ''}
                            </p>
                            {/* 자기 행 제외 — 같은 API의 본인 대상은 '나가기'(05 모임 설정). me 도착 전엔
                            자기 행을 못 가리므로 숨긴다(내보내기인 줄 알고 눌러 나가기가 되면 안 된다) */}
                            {me && member.userId !== me.id && (
                              <button
                                type="button"
                                onClick={() => setRemoveTarget(member)}
                                className="shrink-0 text-[13px] font-medium text-warn"
                              >
                                내보내기
                              </button>
                            )}
                          </li>
                        ) : (
                          <li
                            key={member.userId}
                            className="rounded-2xl border border-border bg-white p-4 shadow-card"
                          >
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="min-w-0 truncate font-bold text-text">
                                {member.nickname}
                              </p>
                              {/* 이 화면은 관리자 전용이라 멤버 행이 자기 행일 수 없다 — me 무관 노출 */}
                              <button
                                type="button"
                                onClick={() => setRemoveTarget(member)}
                                className="shrink-0 text-[13px] font-medium text-warn"
                              >
                                내보내기
                              </button>
                            </div>
                            {member.mappings.length > 0 ? (
                              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                {member.mappings.map((mapping) => {
                                  const personName = mapping.personName ?? UNNAMED_PERSON_LABEL
                                  return (
                                    <span
                                      key={mapping.personId}
                                      className="flex items-center gap-1.5 rounded-full bg-primary py-1.5 pl-3 pr-2 text-xs font-bold text-text"
                                    >
                                      {personName}
                                      <button
                                        type="button"
                                        aria-label={`${personName} 연결 해제`}
                                        onClick={() => setUnlinkTarget({ member, mapping })}
                                        className="text-text/60"
                                      >
                                        <IconClose size={11} />
                                      </button>
                                    </span>
                                  )
                                })}
                                <button
                                  type="button"
                                  onClick={() => setLinkTarget(member)}
                                  className="rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-muted"
                                >
                                  + 연결
                                </button>
                              </div>
                            ) : (
                              <div className="mt-1.5 flex items-center justify-between gap-3">
                                {/* 신청 원문은 연결 전까지 보존·표기(§2) — 연결·재연결 때 관리자가 참조 */}
                                <p className="min-w-0 truncate text-[13px] text-muted">
                                  {member.childNames.length > 0
                                    ? `신청: ${member.childNames.join(', ')}`
                                    : '아직 연결된 인물이 없어요'}
                                </p>
                                <Button size="sm" onClick={() => setLinkTarget(member)}>
                                  연결
                                </Button>
                              </div>
                            )}
                          </li>
                        ),
                      )}
                    </ul>
                  </section>
                ) : requests.length === 0 && !requestsApi.error ? (
                  // 링크를 다른 화면에서 찾으라고 하지 않는다 — 이제 이 화면 위쪽이 그 자리다
                  <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
                ) : null}
              </>
            ) : (
              <LoadState
                loading={membersApi.loading}
                error={membersApi.error}
                loadingText="멤버를 불러오는 중…"
                onRetry={membersApi.refetch}
                unauthorizedTo="/login"
                notFoundTo={`/groups/${groupId}`}
                notFoundLabel="모임으로"
              />
            )}
          </>
        )}
      </main>

      {/* 20-1 인물 연결 시트 — 열려 있을 때만 마운트(매 오픈이 신선한 인물 목록·상태).
          일반 모임엔 연결할 대상(viewer 멤버)이 없어 이 시트가 열릴 일도 없다 */}
      {linkTarget && (
        <ChildLinkSheet
          groupId={groupId}
          member={linkTarget}
          onClose={() => setLinkTarget(null)}
          onLinked={(personNames) => {
            toast.show(`🧀 '${personNames.join(', ')}' 앨범을 연결했어요`)
            setLinkTarget(null)
            membersApi.refetch()
          }}
        />
      )}

      {/* 내보내기 확인 — 멤버십·매핑만 지워지고(사진·앨범은 모임에 남음) 재신청은 가능하다 */}
      <ConfirmDialog
        open={removeTarget !== null}
        danger
        busy={removing}
        busyLabel="내보내는 중…"
        title={removeTarget ? `'${removeTarget.nickname}'님을 내보낼까요?` : ''}
        description={
          removeTarget?.role === 'viewer'
            ? '이 모임의 사진을 더 이상 볼 수 없고, 인물 연결도 함께 해제돼요. 참여 링크로 다시 신청할 수 있어요.'
            : '이 모임을 더 이상 관리할 수 없어요. 그동안 올린 사진·앨범은 모임에 남아요. 참여 링크로 다시 신청할 수 있어요.'
        }
        confirmLabel="내보내기"
        onConfirm={() => void handleRemove()}
        onClose={() => {
          if (!removing) setRemoveTarget(null)
        }}
      />

      {/* 거절 확인 — 거절은 신청 삭제(복구 불가·재신청은 가능)라 한 번 확인한다 */}
      <ConfirmDialog
        open={rejectTarget !== null}
        danger
        busy={rejectTarget !== null && busyRequestId === rejectTarget.id}
        busyLabel="거절 중…"
        title="신청을 거절할까요?"
        description={
          rejectTarget
            ? `'${rejectTarget.nickname}'님의 참여 신청이 삭제돼요. 필요하면 다시 신청할 수 있어요.`
            : ''
        }
        confirmLabel="거절"
        onConfirm={() => {
          if (rejectTarget) void handleResolve(rejectTarget, 'rejected')
        }}
        onClose={() => {
          if (busyRequestId === null) setRejectTarget(null)
        }}
      />

      {/* 연결 해제 확인 — 해제하면 그 멤버에게 인물 앨범이 더는 보이지 않는다(§7-1 미연결 회귀) */}
      <ConfirmDialog
        open={unlinkTarget !== null}
        danger
        busy={unlinking}
        busyLabel="해제 중…"
        title="연결을 해제할까요?"
        description={
          unlinkTarget
            ? `${unlinkTarget.member.nickname}님에게 더 이상 '${
                unlinkTarget.mapping.personName ?? UNNAMED_PERSON_LABEL
              }' 앨범이 보이지 않아요. 언제든 다시 연결할 수 있어요.`
            : ''
        }
        confirmLabel="해제"
        onConfirm={() => void handleUnlink()}
        onClose={() => {
          if (!unlinking) setUnlinkTarget(null)
        }}
      />
    </PhoneShell>
  )
}
