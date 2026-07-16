/**
 * 모임 핸들러 (docs/api-spec.md §3.2) — 목록/생성/상세/이름수정/참여/초대/학부모 공유.
 */
import { http } from 'msw'
import {
  addMembership,
  db,
  deleteGroupCascade,
  findGroup,
  groupsOfUser,
  nextId,
  nowIso,
  type DbGroup,
} from '../db'
import {
  api,
  canAccessGroup,
  created,
  errorResponse,
  invalidBody,
  invalidRequest,
  notFound,
  ok,
  optionalString,
  readJson,
  requiredString,
  toId,
  unauthorized,
  userFrom,
} from './shared'
import { joinUrlOf, shareUrlOf, toGroupDetail, toGroupSummary } from './serializers'

const GROUP_NOT_FOUND = '모임을 찾을 수 없습니다.'

function randomJoinKey(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let key = ''
  do {
    key = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  } while (db.groups.some((g) => g.joinKey === key))
  return key
}

function randomSharePassword(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export const groupHandlers = [
  // GET /groups — 내 모임 목록(bare 배열) · 화면 02
  http.get(api('/groups'), ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    return ok(groupsOfUser(user.id).map(toGroupSummary))
  }),

  // POST /groups — 모임 만들기(생성자는 자동 멤버, 학부모 공유 자동 발급) · 화면 03
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
      share: { token: `shr_${nextId('tok')}`, password: randomSharePassword() },
      createdAt: nowIso(),
    }
    db.groups.push(group)
    addMembership(user.id, group.id)
    return created(toGroupDetail(group))
  }),

  // GET /groups/:id — 모임 상세 · 화면 05
  http.get(api('/groups/:id'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group || !canAccessGroup(user, group.id)) return notFound(GROUP_NOT_FOUND)
    return ok(toGroupDetail(group))
  }),

  // PATCH /groups/:id — 모임 이름 수정(name만 허용, 그 외 필드 무시) · 화면 05 ⚙
  http.patch(api('/groups/:id'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group || !canAccessGroup(user, group.id)) return notFound(GROUP_NOT_FOUND)

    const body = await readJson<{ name?: unknown }>(request)
    if (!body) return invalidBody()
    const name = optionalString(body.name)
    if (name === null) return invalidRequest('모임 이름을 입력해 주세요.')
    if (name !== undefined) group.name = name
    return ok(toGroupDetail(group))
  }),

  // DELETE /groups/:id — 모임 삭제(하위 이벤트·앨범·사진 연쇄 정리) · 화면 05 ⚙
  // BE CHMO-273 진행 중(스웨거 미배포) — 성공 봉투(result null)로 응답, 배포 후 계약 재확인
  http.delete(api('/groups/:id'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group || !canAccessGroup(user, group.id)) return notFound(GROUP_NOT_FOUND)
    deleteGroupCascade(group.id)
    return ok(null)
  }),

  // POST /groups/join — 모임 참여(선생님 초대 수락) · 화면 02-1
  http.post(api('/groups/join'), async ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    const body = await readJson<{ joinKey?: unknown; password?: unknown }>(request)
    const joinKey = requiredString(body?.joinKey)
    const password = requiredString(body?.password)
    if (!joinKey || !password) return invalidRequest('참여 코드와 모임 비밀번호를 입력해 주세요.')
    const group = db.groups.find((g) => g.joinKey === joinKey)
    if (!group) return notFound(GROUP_NOT_FOUND)
    // BE JOIN403 — 뷰어 잠금 해제(학부모 비밀번호)도 같은 코드를 쓴다
    if (group.password !== password)
      return errorResponse(403, 'JOIN403', '비밀번호가 일치하지 않습니다.')
    // BE 코드 미확인 — 이미 멤버 409는 채집되지 않았다
    if (canAccessGroup(user, group.id))
      return errorResponse(409, 'ALREADY_MEMBER', '이미 참여 중인 모임입니다.')

    addMembership(user.id, group.id)
    return ok(toGroupDetail(group))
  }),

  // GET /groups/:id/invite — 초대 정보(모임 비밀번호는 멤버에게만) · 화면 초대
  http.get(api('/groups/:id/invite'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group || !canAccessGroup(user, group.id)) return notFound(GROUP_NOT_FOUND)
    return ok({
      joinKey: group.joinKey,
      password: group.password,
      joinUrl: joinUrlOf(group),
    })
  }),

  // GET /groups/:id/share — 학부모 공유 정보(평문 비밀번호는 멤버에게만) · 화면 05
  http.get(api('/groups/:id/share'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group || !canAccessGroup(user, group.id)) return notFound(GROUP_NOT_FOUND)
    return ok({
      token: group.share.token,
      url: shareUrlOf(group),
      password: group.share.password,
      hasPassword: true,
    })
  }),
]
