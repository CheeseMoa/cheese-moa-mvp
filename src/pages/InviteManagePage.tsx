import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { ChildLinkSheet } from '../components/ChildLinkSheet'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Header,
  IconClose,
  LoadState,
  useToast,
} from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useMutation } from '../hooks/useMutation'
import { getMe } from '../api/auth'
import {
  listGroupMembers,
  listJoinRequests,
  resolveJoinRequest,
  unlinkPersonParent,
} from '../api/groups'
import { formatTimeAgo } from '../lib/timeAgo'
import { UNNAMED_PERSON_LABEL } from '../lib/albumLabels'
import type { GroupMember, GroupRole, ID, JoinRequest, PersonMapping } from '../types/api'

/** 탭 순서는 초대 시트(05-2)와 동일 — 라벨은 호칭, 섹션 제목은 명단 명칭 */
const TAB_KEYS: GroupRole[] = ['teacher', 'parent']
const TAB_LABEL: Record<GroupRole, string> = { teacher: '선생님', parent: '학부모님' }
const SECTION_LABEL: Record<GroupRole, string> = { teacher: '선생님', parent: '학부모' }

/**
 * 20. 초대 관리 · node 307:24(학부모 탭)·319:40(선생님 탭) — 05 하단 [초대 관리] 진입(CHMO-447).
 * GET /groups/:id/join-requests(대기 신청) · PATCH /join-requests/:id(승인/거절 — 승인은
 * **멤버 확정만**, 인물 연결은 별도 액션 §1) · GET /groups/:id/members(명단·연결 칩) ·
 * DELETE /groups/:id/person-parents(칩 ✕ 해제 — 확인 다이얼로그).
 * 아이 연결(20-1)은 이 화면 위 바텀시트(ChildLinkSheet)로 뜬다.
 * TEACHER 전용은 서버가 강제(ROLE403·비멤버 404 은닉) — 비정상 진입은 LoadState 에러로 수렴.
 * 기본 탭은 학부모님 — 이 화면의 주 업무(신청 승인·아이 연결)가 학부모 쪽이다.
 *
 * 승인제가 role 무관으로 통일되면서(CHMO-475) 신청 목록에 **선생님 신청도 섞여 온다**
 * (role=TEACHER·childNames 빈 배열 — 원문 줄 없이 닉네임+시각만 렌더된다). 기본 탭이
 * 학부모님이라 선생님 신청이 묻히지 않게 탭 라벨에 탭별 대기 수를 붙인다.
 */
export function InviteManagePage() {
  const { groupId = '' } = useParams<{ groupId: string }>()
  const toast = useToast()
  const mutate = useMutation()
  const [tab, setTab] = useState<GroupRole>('parent')
  // "(나)" 표기용 — 실패해도 명단은 그대로 보여준다(표기만 생략)
  const meApi = useApi('me', getMe)
  const requestsApi = useApi(`join-requests:${groupId}`, (signal) =>
    listJoinRequests(groupId, signal),
  )
  const membersApi = useApi(`group-members:${groupId}`, (signal) =>
    listGroupMembers(groupId, signal),
  )

  // 신청 승인/거절 — 처리 중인 신청 id(카드 버튼·거절 다이얼로그 공용 busy)
  const [busyRequestId, setBusyRequestId] = useState<ID | null>(null)
  const [rejectTarget, setRejectTarget] = useState<JoinRequest | null>(null)
  // 아이 연결(20-1 시트)·해제(확인 다이얼로그) 대상
  const [linkTarget, setLinkTarget] = useState<GroupMember | null>(null)
  const [unlinkTarget, setUnlinkTarget] = useState<{
    member: GroupMember
    mapping: PersonMapping
  } | null>(null)
  const [unlinking, setUnlinking] = useState(false)

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

  const me = meApi.data
  const allRequests = requestsApi.data ?? []
  const requests = allRequests.filter((r) => r.role === tab)
  const members = (membersApi.data ?? []).filter((m) => m.role === tab)
  // 탭별 대기 수 — 기본 탭이 학부모님이라, 표시가 없으면 선생님 신청이 온 줄 모른다(CHMO-475)
  const pendingCountOf = (role: GroupRole) => allRequests.filter((r) => r.role === role).length

  return (
    <PhoneShell>
      <Header backTo={`/groups/${groupId}`} backLabel="모임 상세" title="초대 관리" />

      {/* 세그먼트 탭 — 스크롤 밖 고정(긴 명단에서도 항상 전환 가능) · 스타일은 05-2 시트와 동일 */}
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
                aria-label={waiting > 0 ? `${TAB_LABEL[key]} · 대기 신청 ${waiting}건` : undefined}
                onClick={() => setTab(key)}
                className={`flex-1 rounded-full py-2 text-sm transition ${
                  tab === key ? 'bg-primary font-bold text-text' : 'font-medium text-muted'
                }`}
              >
                {TAB_LABEL[key]}
                {waiting > 0 && (
                  <span
                    aria-hidden="true"
                    className="ml-1.5 inline-block rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold leading-none text-white"
                  >
                    {waiting}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <main className="flex flex-1 flex-col overflow-y-auto px-5 pb-safe-9 pt-4">
        {membersApi.data ? (
          <>
            {/* 대기 신청 — 이 화면의 첫 번째 일이라 명단보다 위. 조회 실패는 명단을 가리지 않고
                인라인으로만 알린다(05 뱃지 생략과 같은 결 — 단, 관리 화면에선 침묵하지 않는다) */}
            {requestsApi.error ? (
              <section className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4 shadow-card">
                <p className="text-[13px] text-muted">신청 목록을 불러오지 못했어요</p>
                <button
                  type="button"
                  onClick={requestsApi.refetch}
                  className="shrink-0 text-[13px] font-medium text-accent"
                >
                  다시 시도
                </button>
              </section>
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
                        <p className="min-w-0 truncate font-bold text-text">{request.nickname}</p>
                        <span className="shrink-0 text-xs text-muted">
                          {formatTimeAgo(request.createdAt)}
                        </span>
                      </div>
                      {request.childNames.length > 0 && (
                        <p className="mt-0.5 text-[13px] text-muted">
                          “{request.childNames.join(', ')} 학부모입니다”
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

            {members.length > 0 ? (
              <section>
                <h3 className="text-[12px] tracking-[0.06em] text-muted">
                  {SECTION_LABEL[tab]} {members.length}
                </h3>
                <ul className="mt-2 flex flex-col gap-3">
                  {members.map((member) =>
                    member.role === 'teacher' ? (
                      <li
                        key={member.userId}
                        className="rounded-2xl border border-border bg-white px-4 py-3.5 shadow-card"
                      >
                        <p className="truncate font-bold text-text">
                          {member.nickname}
                          {me && member.userId === me.id ? ' (나)' : ''}
                        </p>
                      </li>
                    ) : (
                      <li
                        key={member.userId}
                        className="rounded-2xl border border-border bg-white p-4 shadow-card"
                      >
                        <p className="truncate font-bold text-text">{member.nickname}</p>
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
                            {/* 신청 원문은 연결 전까지 보존·표기(§2) — 연결·재연결 때 선생님이 참조 */}
                            <p className="min-w-0 truncate text-[13px] text-muted">
                              {member.childNames.length > 0
                                ? `신청: ${member.childNames.join(', ')}`
                                : '아직 연결된 아이가 없어요'}
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
              <EmptyState
                title={tab === 'parent' ? '아직 학부모님이 없어요' : '아직 선생님이 없어요'}
                description={
                  tab === 'parent' ? (
                    <>
                      모임 상세의 [＋ 초대하기]에서
                      <br />
                      학부모님께 신청 링크를 보내 보세요.
                    </>
                  ) : (
                    <>
                      모임 상세의 [＋ 초대하기]에서
                      <br />
                      함께할 선생님을 초대해 보세요.
                    </>
                  )
                }
              />
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
            notFoundLabel="모임 상세로"
          />
        )}
      </main>

      {/* 20-1 아이 연결 시트 — 열려 있을 때만 마운트(매 오픈이 신선한 인물 목록·상태) */}
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

      {/* 연결 해제 확인 — 해제하면 학부모에게 그 아이 앨범이 더는 보이지 않는다(§7-1 미연결 회귀) */}
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
