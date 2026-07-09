/**
 * 모임 핸들러 (docs/api-spec.md §3.2) — 목록/생성/상세/이름수정/참여/초대/학부모 공유.
 */
import { http, HttpResponse } from 'msw'
import { addMembership, db, findGroup, groupsOfUser, nextId, nowIso, type DbGroup } from '../db'
import {
  api,
  canAccessGroup,
  errorResponse,
  invalidBody,
  notFound,
  optionalString,
  readJson,
  requiredString,
  toId,
  unauthorized,
  userFrom,
} from './shared'
import { joinUrlOf, shareUrlOf, toGroup } from './serializers'

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
  // GET /groups — 내 모임 목록 · 화면 02
  http.get(api('/groups'), ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    return HttpResponse.json({ groups: groupsOfUser(user.id).map((g) => toGroup(g)) })
  }),

  // POST /groups — 모임 만들기(생성자는 자동 멤버, 학부모 공유 자동 발급) · 화면 03
  http.post(api('/groups'), async ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    const body = await readJson<{ name?: unknown; password?: unknown }>(request)
    const name = requiredString(body?.name)
    const password = requiredString(body?.password)
    if (!name) return errorResponse(400, 'VALIDATION_ERROR', '모임 이름을 입력해 주세요.')
    if (!password) return errorResponse(400, 'VALIDATION_ERROR', '모임 비밀번호를 입력해 주세요.')

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
    return HttpResponse.json(toGroup(group, { includeShare: true }), { status: 201 })
  }),

  // GET /groups/:id — 모임 상세 · 화면 05
  http.get(api('/groups/:id'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group || !canAccessGroup(user, group.id)) return notFound(GROUP_NOT_FOUND)
    return HttpResponse.json(toGroup(group, { includeShare: true }))
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
    if (name === null) return errorResponse(400, 'VALIDATION_ERROR', '모임 이름을 입력해 주세요.')
    if (name !== undefined) group.name = name
    return HttpResponse.json(toGroup(group, { includeShare: true }))
  }),

  // POST /groups/join — 모임 참여(선생님 초대 수락) · 화면 02-1
  http.post(api('/groups/join'), async ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    const body = await readJson<{ joinKey?: unknown; password?: unknown }>(request)
    const joinKey = requiredString(body?.joinKey)
    const password = requiredString(body?.password)
    if (!joinKey || !password)
      return errorResponse(400, 'VALIDATION_ERROR', '참여 코드와 모임 비밀번호를 입력해 주세요.')
    const group = db.groups.find((g) => g.joinKey === joinKey)
    if (!group) return notFound(GROUP_NOT_FOUND)
    if (group.password !== password)
      return errorResponse(403, 'WRONG_PASSWORD', '모임 비밀번호가 올바르지 않습니다.')
    if (canAccessGroup(user, group.id))
      return errorResponse(409, 'ALREADY_MEMBER', '이미 참여 중인 모임입니다.')

    addMembership(user.id, group.id)
    return HttpResponse.json(toGroup(group, { includeShare: true }))
  }),

  // GET /groups/:id/invite — 초대 정보(모임 비밀번호는 멤버에게만) · 화면 초대
  http.get(api('/groups/:id/invite'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group || !canAccessGroup(user, group.id)) return notFound(GROUP_NOT_FOUND)
    return HttpResponse.json({
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
    return HttpResponse.json({
      token: group.share.token,
      url: shareUrlOf(group),
      password: group.share.password,
      hasPassword: true,
    })
  }),
]
