/**
 * 모임 핸들러 (docs/api-spec.md §3.2 + 학부모 전환 docs/parent-model-api-draft.md §1~3) —
 * 목록/생성/상세/이름수정/참여(신청)/초대/학부모 공유. 신설 승인·멤버·매핑·학부모 사진은 parents.ts.
 */
import { http } from 'msw'
import {
  createMembership,
  db,
  deleteGroupCascade,
  findGroup,
  membershipOf,
  membershipsOfUser,
  nextId,
  nowIso,
  type DbGroup,
} from '../db'
import {
  api,
  created,
  errorResponse,
  invalidBody,
  invalidRequest,
  groupNotFound,
  ok,
  optionalString,
  readJson,
  requiredString,
  teacherOnlyError,
  toId,
  unauthorized,
  userFrom,
} from './shared'
import { shareUrlOf, toGroupDetail, toGroupSummary, toJoinGroupResponse } from './serializers'

function randomJoinKey(): string {
  // 실 BE는 대소문자 혼합 12자를 발급하고 대소문자를 구분해 매칭한다(채집 예: Fh1TDIk81EPP — CHMO-285)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let key = ''
  do {
    key = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  } while (db.groups.some((g) => g.joinKey === key || g.parentJoinKey === key))
  return key
}

function randomSharePassword(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export const groupHandlers = [
  // GET /groups — 내 모임 목록(bare 배열, **PENDING 신청 모임 포함** — 홈 비활성 카드용 §7-2) · 화면 02
  http.get(api('/groups'), ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const items = membershipsOfUser(user.id)
      .map((membership) => {
        const group = findGroup(membership.groupId)
        return group ? toGroupSummary(group, membership) : null
      })
      .filter((item) => item !== null)
    return ok(items)
  }),

  // POST /groups — 모임 만들기(생성자는 ACTIVE TEACHER로 즉시 확정, 학부모 공유 자동 발급) · 화면 03
  http.post(api('/groups'), async ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    const body = await readJson<{ name?: unknown; password?: unknown }>(request)
    const name = requiredString(body?.name)
    const password = requiredString(body?.password)
    if (!name) return invalidRequest('모임 이름을 입력해 주세요.')
    if (!password) return invalidRequest('모임 비밀번호를 입력해 주세요.')

    const group: DbGroup = {
      id: nextId('grp'),
      name,
      password,
      joinKey: randomJoinKey(),
      parentJoinKey: randomJoinKey(),
      share: { token: `shr_${nextId('tok')}`, password: randomSharePassword() },
      createdAt: nowIso(),
    }
    db.groups.push(group)
    const membership = createMembership({
      userId: user.id,
      groupId: group.id,
      role: 'teacher',
      status: 'active',
    })
    return created(toGroupDetail(group, membership))
  }),

  // GET /groups/:id — 모임 상세(ACTIVE 멤버 전용 §7-2) · 화면 05
  // PARENT 응답엔 멤버 관련 필드가 없다(§7-3 — serializer가 role로 분기).
  http.get(api('/groups/:id'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const membership = membershipOf(user.id, group.id)
    if (!membership) return groupNotFound()
    // PENDING 접근 거부(§7-2 deny-by-default) — BE 코드 미확인(초안: SPACE403 또는 ROLE403 재량)
    if (membership.status !== 'active')
      return errorResponse(403, 'SPACE403', '아직 승인되지 않은 모임입니다.')
    return ok(toGroupDetail(group, membership))
  }),

  // PATCH /groups/:id — 모임 이름 수정(TEACHER 전용 §6 — name만 허용, 그 외 필드 무시) · 화면 05 ⚙
  http.patch(api('/groups/:id'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied

    const body = await readJson<{ name?: unknown }>(request)
    if (!body) return invalidBody()
    const name = optionalString(body.name)
    if (name === null) return invalidRequest('모임 이름을 입력해 주세요.')
    if (name !== undefined) group.name = name
    return ok(toGroupDetail(group, membershipOf(user.id, group.id)!))
  }),

  // DELETE /groups/:id — 모임 삭제(TEACHER 전용 §6, 하위 이벤트·앨범·사진 연쇄 정리) · 화면 05 ⚙
  // BE CHMO-273 진행 중(스웨거 미배포) — 성공 봉투(result null)로 응답, 배포 후 계약 재확인
  http.delete(api('/groups/:id'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied
    deleteGroupCascade(group.id)
    return ok(null)
  }),

  // POST /groups/join — 참여 코드+비밀번호로 **신청(PENDING) 생성**(즉시 합류 아님 — §1 승인제) · 화면 02-1
  // role은 joinKey 종류에서 파생(Q6): 선생님 키=모임 비밀번호, 학부모 키=sharePassword(Q2).
  http.post(api('/groups/join'), async ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    const body = await readJson<{ joinKey?: unknown; password?: unknown; childNames?: unknown }>(
      request,
    )
    const joinKey = requiredString(body?.joinKey)
    const password = requiredString(body?.password)
    if (!joinKey || !password) return invalidRequest('참여 코드와 비밀번호를 입력해 주세요.')

    const teacherGroup = db.groups.find((g) => g.joinKey === joinKey)
    const parentGroup = teacherGroup ? undefined : db.groups.find((g) => g.parentJoinKey === joinKey)
    const group = teacherGroup ?? parentGroup
    if (!group) return groupNotFound()
    const role = teacherGroup ? 'teacher' : 'parent'

    // BE JOIN403 — 뷰어 잠금 해제(학부모 비밀번호)도 같은 코드를 쓴다
    const expected = role === 'teacher' ? group.password : group.share.password
    if (expected !== password) return errorResponse(403, 'JOIN403', '비밀번호가 일치하지 않습니다.')

    // 중복 신청/합류(409)를 childNames 검증(400)보다 먼저 — 뒤에 두면 이미 신청한 학부모의
    // 재시도가 '아이 이름을 입력해 주세요'로 응답돼 자신이 신청 중이라는 사실을 알 수 없다.
    // BE 코드 미확인 — 이미 멤버/신청 중 409는 채집되지 않았다
    const existing = membershipOf(user.id, group.id)
    if (existing)
      return errorResponse(
        409,
        'ALREADY_MEMBER',
        existing.status === 'active' ? '이미 참여 중인 모임입니다.' : '이미 참여 신청한 모임입니다.',
      )

    // 학부모 신청은 자녀 이름(자유 텍스트) 필수 — 신청 UI에 인물 목록을 노출하지 않는다(§2)
    let childNames: string[] = []
    if (role === 'parent') {
      const raw = Array.isArray(body?.childNames) ? body.childNames : []
      childNames = raw.map(requiredString).filter((name): name is string => name !== null)
      if (childNames.length === 0) return invalidRequest('아이 이름을 입력해 주세요.')
    }

    const membership = createMembership({
      userId: user.id,
      groupId: group.id,
      role,
      status: 'pending',
      childNames,
    })
    return created(toJoinGroupResponse(group, membership))
  }),

  // GET /groups/:id/invite — 초대 정보 2종(TEACHER 전용 — PARENT는 ROLE403, Q3) · 화면 05-2
  // 학부모 채널 비밀번호는 기존 sharePassword 재사용(Q2). joinUrl은 주지 않는다(FE가 경로형 파생 — CHMO-237).
  http.get(api('/groups/:id/invite'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied
    return ok({
      teacher: { joinKey: group.joinKey, password: group.password },
      parent: { joinKey: group.parentJoinKey, password: group.share.password },
    })
  }),

  // GET /groups/:id/share — 학부모 공유 정보(무로그인 뷰어 — 폐기 예정 §7, 이관 완료까지 유지) · 화면 05
  // 초대 정보의 일종이라 TEACHER 전용으로 강화(§6).
  http.get(api('/groups/:id/share'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group) return groupNotFound()
    const denied = teacherOnlyError(user, group.id)
    if (denied) return denied
    return ok({
      token: group.share.token,
      url: shareUrlOf(group),
      password: group.share.password,
      hasPassword: true,
    })
  }),
]
