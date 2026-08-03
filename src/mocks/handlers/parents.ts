/**
 * 학부모 전환 신설 핸들러 (CHMO-444 · docs/parent-model-api-draft.md §3~5) —
 * 합류 신청 승인/거절 · 멤버 목록 · 인물 매핑 · 학부모 사진 조회.
 * 실 BE 미구현 — 경로·필드명은 초안 기준(의미는 협의 확정), 배포 후 실계약으로 재확인한다.
 */
import { http } from 'msw'
import {
  activeMembersOfGroup,
  db,
  deleteGroupCascade,
  findEvent,
  findGroup,
  findMembershipById,
  hasAnalyzingEvent,
  hasPersonParent,
  isActiveTeacher,
  linkPersonParent,
  membershipOf,
  parentEventHasMappedChild,
  pendingRequestsOfGroup,
  removeMembershipCascade,
  settleAnalysis,
  teacherCountOf,
  unlinkPersonParent,
  type DbMembership,
  type DbUser,
} from '../db'
import {
  api,
  errorResponse,
  eventNotFound,
  groupNotFound,
  invalidBody,
  invalidRequest,
  membershipRoleError,
  notFound,
  ok,
  readJson,
  requiredString,
  roleForbidden,
  spaceForbidden,
  teacherOnlyError,
  toId,
  unauthorized,
  userFrom,
} from './shared'
import {
  toGroupMemberResponse,
  toJoinRequestResponse,
  toParentEventPhotosResponse,
} from './serializers'

/** 매핑 요청 본문 정규화 — {userId, personId} 둘 다 유효한 id여야 한다 */
async function readPersonParentBody(
  request: Request,
): Promise<{ userId: number; personId: number } | null> {
  const body = await readJson<{ userId?: unknown; personId?: unknown }>(request)
  const userId = toId(body?.userId)
  const personId = toId(body?.personId)
  if (userId === null || personId === null) return null
  return { userId, personId }
}

/**
 * 학부모 사진 조회 관문(§5) — 이벤트 존재 + published + 호출자가 그 모임의 ACTIVE PARENT.
 * 멤버십 판정은 선생님 관문과 같은 membershipRoleError 한 구현을 role만 바꿔 쓴다
 * (비멤버·PENDING 은닉 → role 불일치 ROLE403 — TEACHER는 제작자 API를 쓴다).
 */
function parentPhotosGate(user: DbUser, eventId: number | null) {
  const event = findEvent(eventId)
  if (!event) return { error: eventNotFound() }
  settleAnalysis(event.id)
  const denied = membershipRoleError(user, event.groupId, 'parent', eventNotFound)
  if (denied) return { error: denied }
  // PARENT에겐 published이면서 **아이가 나온** 이벤트만 존재한다(목록 필터와 동일 판정 —
  // CHMO-448 노출 강화, 딥링크로 사진만 조회해도 같은 404 은닉)
  if (event.status !== 'published' || !parentEventHasMappedChild(event.id, user.id))
    return { error: eventNotFound() }
  return { event }
}

export const parentHandlers = [
  // GET /groups/:id/join-requests?status=PENDING — 대기 신청 목록(TEACHER 전용, bare 배열) · 화면 20
  http.get(api('/groups/:id/join-requests'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied

    // 초안은 PENDING 조회만 정의한다 — 다른 status 값은 빈 배열(BE 재량 영역)
    const status = new URL(request.url).searchParams.get('status') ?? 'PENDING'
    if (status !== 'PENDING') return ok([])
    const items = pendingRequestsOfGroup(group.id)
      .map((membership) => {
        const requester = db.users.find((u) => u.id === membership.userId)
        return requester ? toJoinRequestResponse(membership, requester) : null
      })
      .filter((item) => item !== null)
    return ok(items)
  }),

  // PATCH /join-requests/:id — 승인/거절(TEACHER 전용) · 화면 20
  // 승인은 **멤버 확정만**(인물과 무관 — personId 없음, 승인·매핑 분리 확정 §1). 거절은 신청 삭제.
  http.patch(api('/join-requests/:id'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const membership = findMembershipById(toId(params.id))
    // 신청 부재·비멤버·타 role 전부 **같은 404로 수렴** — 응답이 갈리면 id 열거로 남의 모임
    // 신청 존재가 노출된다(§7-2 deny-by-default). 경로에 모임 id가 없어 ROLE403도 정보가 된다.
    // BE 코드 미확인 — 신청 없음 404는 채집되지 않았다
    if (
      !membership ||
      membership.status !== 'pending' ||
      !isActiveTeacher(user.id, membership.groupId)
    )
      return notFound('처리할 신청을 찾을 수 없습니다.')

    const body = await readJson<{ status?: unknown }>(request)
    if (!body) return invalidBody()
    const status = requiredString(body.status)
    if (status !== 'APPROVED' && status !== 'REJECTED')
      return invalidRequest('status는 APPROVED 또는 REJECTED여야 합니다.')

    if (status === 'APPROVED') {
      membership.status = 'active'
    } else {
      db.memberships = db.memberships.filter((m) => m.id !== membership.id)
    }
    return ok({ joinRequestId: membership.id, status })
  }),

  // GET /groups/:id/members — ACTIVE 멤버 목록(TEACHER 전용, bare 배열) · 화면 20
  // 학부모 항목은 신청 원문(childNames — 연결 전까지 보존 §2)과 매핑을 포함한다.
  http.get(api('/groups/:id/members'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied

    const items = activeMembersOfGroup(group.id)
      .map((membership) => {
        const member = db.users.find((u) => u.id === membership.userId)
        return member ? toGroupMemberResponse(membership, member) : null
      })
      .filter((item) => item !== null)
    return ok(items)
  }),

  // DELETE /groups/:id/members/:userId — 멤버 내보내기·나가기(BE CHMO-525·564) · 화면 20·05 (CHMO-526·571)
  // 대상이 자신이면 나가기(role 무관 — PENDING이면 신청 취소), 타인이면 TEACHER 전용 내보내기.
  // 마지막 ACTIVE 선생님의 **나가기는 모임 삭제로 승격**(CHMO-564 — 거부 대신 같은 결과를 한
  // 동작으로, 확인 책임은 FE 모달). 내보내기 쪽 가드는 그대로다(MEMBER409) — 내보내는 쪽이
  // ACTIVE 선생님이라 정상 경로에선 성립하지 않고 동시 나가기 경쟁에서만 걸린다.
  http.delete(api('/groups/:id/members/:userId'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const groupId = toId(params.id)
    const targetUserId = toId(params.userId)

    const isLastActiveTeacher = (target: DbMembership) =>
      target.role === 'teacher' && target.status === 'active' && teacherCountOf(target.groupId) <= 1

    // 나가기 — 모임 조회보다 멤버십 판정이 먼저다: 멤버십이 없으면 모임 존재 여부를 흘리지 않고
    // SPACE403으로 끝낸다(BE 스펙 "본인 부재는 403" — 멱등 성공은 타인 내보내기 쪽만)
    if (targetUserId !== null && targetUserId === user.id) {
      const mine = groupId === null ? undefined : membershipOf(user.id, groupId)
      if (!mine) return spaceForbidden()
      if (isLastActiveTeacher(mine)) {
        // 모임 삭제의 분석 중 가드를 나가기로 우회할 수 없다(CHMO-564 AC-3 — purge 전에 직접 가드)
        if (hasAnalyzingEvent(mine.groupId))
          return errorResponse(
            409,
            'MOMENT409',
            '분석 중인 이벤트는 삭제할 수 없습니다. 분석이 끝난 뒤 다시 시도해 주세요.',
          )
        deleteGroupCascade(mine.groupId)
        return ok(null)
      }
      removeMembershipCascade(mine)
      return ok(null)
    }

    // 내보내기 — 모임 없음(SPACE404) → 비멤버·PENDING(SPACE403) → 학부모(ROLE403) 순 판정
    const group = findGroup(groupId)
    if (!group || targetUserId === null) return groupNotFound()
    const caller = membershipOf(user.id, group.id)
    if (caller?.status !== 'active') return spaceForbidden()
    if (caller.role !== 'teacher') return roleForbidden()
    const target = membershipOf(targetUserId, group.id)
    // 이미 없는 멤버는 멱등 성공 — 중복 탭·경쟁 삭제를 오류로 만들지 않는다(BE와 동일)
    if (!target) return ok(null)
    if (isLastActiveTeacher(target))
      return errorResponse(409, 'MEMBER409', '모임에는 최소 1명의 선생님이 남아야 합니다.')
    removeMembershipCascade(target)
    return ok(null)
  }),

  // POST /groups/:id/person-parents — 학부모↔인물 매핑 생성(TEACHER 전용, 다대다 §4) · 화면 20-1
  http.post(api('/groups/:id/person-parents'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied

    const body = await readPersonParentBody(request)
    if (!body) return invalidRequest('userId와 personId를 보내 주세요.')
    const target = membershipOf(body.userId, group.id)
    if (target?.status !== 'active' || target.role !== 'parent')
      return invalidRequest('이 모임의 학부모 멤버가 아닙니다.')
    const person = db.persons.find((p) => p.id === body.personId && p.groupId === group.id)
    // BE 코드 미확인 — 인물 없음 404는 채집되지 않았다
    if (!person) return notFound('연결할 인물을 찾을 수 없습니다.')
    // BE 코드 미확인 — 중복 매핑 409는 채집되지 않았다
    if (hasPersonParent(body.userId, body.personId))
      return errorResponse(409, 'ALREADY_MAPPED', '이미 연결된 인물입니다.')

    linkPersonParent(body.userId, body.personId)
    return ok({ userId: body.userId, personId: body.personId })
  }),

  // DELETE /groups/:id/person-parents — 매핑 해제(TEACHER 전용) · 화면 20
  // 해제는 미연결(매핑 0건)로 회귀할 뿐 새 상태를 만들지 않는다(§7-1).
  // 스코프 검증은 생성(POST)과 대칭 — 인물·대상 학부모가 **이 모임**의 것이어야 한다.
  // 아니면 타 모임 선생님이 경로만 자기 모임으로 바꿔 남의 매핑을 풀 수 있다.
  http.delete(api('/groups/:id/person-parents'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied

    const body = await readPersonParentBody(request)
    if (!body) return invalidRequest('userId와 personId를 보내 주세요.')
    const target = membershipOf(body.userId, group.id)
    if (target?.status !== 'active' || target.role !== 'parent')
      return invalidRequest('이 모임의 학부모 멤버가 아닙니다.')
    const person = db.persons.find((p) => p.id === body.personId && p.groupId === group.id)
    // BE 코드 미확인 — 없는 매핑 404는 채집되지 않았다
    if (!person || !hasPersonParent(body.userId, body.personId))
      return notFound('해제할 연결을 찾을 수 없습니다.')

    unlinkPersonParent(body.userId, body.personId)
    return ok(null)
  }),

  // GET /events/:id/parent-photos — 학부모 노출 사진 플랫 조회(ACTIVE PARENT 전용 §5) · 화면 19
  // 범위: 매핑된 인물 + 공통(Q1), reviewed && published(뷰어 게이트 이관 — CHMO-324). 미연결이면 공통만.
  http.get(api('/events/:id/parent-photos'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const gate = parentPhotosGate(user, toId(params.id))
    if ('error' in gate) return gate.error
    return ok(toParentEventPhotosResponse(gate.event, user.id))
  }),

  // GET /events/:id/parent-photos/download — 같은 범위의 이벤트 단위 zip(기존 앨범 zip 응답 형태) · 화면 19
  // zip 실체는 share.ts의 /mock-zip 핸들러(빈 ZIP)를 재사용한다.
  http.get(api('/events/:id/parent-photos/download'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const gate = parentPhotosGate(user, toId(params.id))
    if ('error' in gate) return gate.error
    return ok({
      downloadUrl: `${window.location.origin}/mock-zip/parent_${gate.event.id}_${user.id}.zip`,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
  }),
]
