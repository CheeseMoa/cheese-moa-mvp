/**
 * 인증 핸들러 (docs/api-spec.md §3.1) — signup / login / me 조회·편집.
 */
import { http, HttpResponse } from 'msw'
import type { AuthResponse } from '../../types/api'
import { db, issueAccessToken, nextId, nowIso } from '../db'
import { api, errorResponse, readJson, unauthorized, userFrom } from './shared'
import { toUser } from './serializers'

const PIN_RE = /^\d{4}$/

function nicknameTaken(nickname: string, exceptUserId?: string): boolean {
  return db.users.some((u) => u.nickname === nickname && u.id !== exceptUserId)
}

export const authHandlers = [
  // POST /auth/signup — 계정 생성 · 화면 01-2
  http.post(api('/auth/signup'), async ({ request }) => {
    const body = await readJson<{ nickname?: string; pin?: string }>(request)
    const nickname = body?.nickname?.trim()
    if (!nickname) return errorResponse(400, 'VALIDATION_ERROR', '닉네임을 입력해 주세요.')
    if (!PIN_RE.test(body?.pin ?? ''))
      return errorResponse(400, 'INVALID_PIN', 'PIN은 숫자 4자리여야 합니다.')
    if (nicknameTaken(nickname))
      return errorResponse(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.')

    const user = { id: nextId('usr'), nickname, pin: body!.pin!, createdAt: nowIso() }
    db.users.push(user)
    const response: AuthResponse = { accessToken: issueAccessToken(user.id), user: toUser(user) }
    return HttpResponse.json(response, { status: 201 })
  }),

  // POST /auth/login — 로그인 · 화면 01-1
  http.post(api('/auth/login'), async ({ request }) => {
    const body = await readJson<{ nickname?: string; pin?: string }>(request)
    const user = db.users.find((u) => u.nickname === body?.nickname && u.pin === body?.pin)
    if (!user)
      return errorResponse(401, 'INVALID_CREDENTIALS', '닉네임 또는 PIN이 올바르지 않습니다.')
    const response: AuthResponse = { accessToken: issueAccessToken(user.id), user: toUser(user) }
    return HttpResponse.json(response)
  }),

  // GET /me — 내 프로필 · 화면 설정
  http.get(api('/me'), ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    return HttpResponse.json(toUser(user))
  }),

  // PATCH /me — 프로필 편집(부분 업데이트) · 화면 설정
  http.patch(api('/me'), async ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    const body = await readJson<{ nickname?: string; pin?: string }>(request)
    if (body?.pin !== undefined && !PIN_RE.test(body.pin))
      return errorResponse(400, 'INVALID_PIN', 'PIN은 숫자 4자리여야 합니다.')
    if (body?.nickname !== undefined) {
      const nickname = body.nickname.trim()
      if (!nickname) return errorResponse(400, 'VALIDATION_ERROR', '닉네임을 입력해 주세요.')
      if (nicknameTaken(nickname, user.id))
        return errorResponse(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.')
      user.nickname = nickname
    }
    if (body?.pin !== undefined) user.pin = body.pin

    return HttpResponse.json(toUser(user))
  }),
]
