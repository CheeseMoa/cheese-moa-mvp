/**
 * 인증 핸들러 (docs/api-spec.md §3.1) — signup / login / me 조회·편집.
 */
import { http, HttpResponse } from 'msw'
import { PIN_RE } from '../../lib/pin'
import type { AuthResponse } from '../../types/api'
import { db, issueAccessToken, nextId, nowIso } from '../db'
import { persistUser, updatePersistedUser } from '../persist'
import {
  api,
  errorResponse,
  invalidBody,
  optionalString,
  readJson,
  requiredString,
  unauthorized,
  userFrom,
} from './shared'
import { toUser } from './serializers'

/** PIN 정규화 — trim 후 숫자 4자리 '문자열'만 유효(숫자 타입 거부 → 저장·비교 타입 통일) */
function normalizePin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const pin = value.trim()
  return PIN_RE.test(pin) ? pin : null
}

function nicknameTaken(nickname: string, exceptUserId?: number): boolean {
  return db.users.some((u) => u.nickname === nickname && u.id !== exceptUserId)
}

export const authHandlers = [
  // POST /auth/signup — 계정 생성 · 화면 01-2
  http.post(api('/auth/signup'), async ({ request }) => {
    const body = await readJson<{ nickname?: unknown; pin?: unknown }>(request)
    const nickname = requiredString(body?.nickname)
    if (!nickname) return errorResponse(400, 'VALIDATION_ERROR', '닉네임을 입력해 주세요.')
    const pin = normalizePin(body?.pin)
    if (!pin) return errorResponse(400, 'INVALID_PIN', 'PIN은 숫자 4자리여야 합니다.')
    if (nicknameTaken(nickname))
      return errorResponse(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.')

    const user = { id: nextId('usr'), nickname, pin, createdAt: nowIso() }
    db.users.push(user)
    persistUser(user) // 가입 계정은 localStorage 보존 — 새로고침(재시드) 후에도 유지
    const response: AuthResponse = { accessToken: issueAccessToken(user.id), user: toUser(user) }
    return HttpResponse.json(response, { status: 201 })
  }),

  // POST /auth/login — 로그인 · 화면 01-1
  http.post(api('/auth/login'), async ({ request }) => {
    const body = await readJson<{ nickname?: unknown; pin?: unknown }>(request)
    // 가입 때와 같은 정규화를 거쳐 비교 — trim/타입 차이로 정상 자격증명이 거부되지 않게
    const nickname = requiredString(body?.nickname)
    const pin = normalizePin(body?.pin)
    const user =
      nickname && pin ? db.users.find((u) => u.nickname === nickname && u.pin === pin) : undefined
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

    const body = await readJson<{ nickname?: unknown; pin?: unknown }>(request)
    if (!body) return invalidBody()

    const nickname = optionalString(body.nickname)
    if (nickname === null) return errorResponse(400, 'VALIDATION_ERROR', '닉네임을 입력해 주세요.')
    const pin = body.pin === undefined ? undefined : normalizePin(body.pin)
    if (pin === null) return errorResponse(400, 'INVALID_PIN', 'PIN은 숫자 4자리여야 합니다.')
    if (nickname !== undefined && nicknameTaken(nickname, user.id))
      return errorResponse(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.')

    if (nickname !== undefined) user.nickname = nickname
    if (pin !== undefined) user.pin = pin
    updatePersistedUser(user) // 보존 대상(가입 계정)이면 localStorage에도 반영

    return HttpResponse.json(toUser(user))
  }),
]
