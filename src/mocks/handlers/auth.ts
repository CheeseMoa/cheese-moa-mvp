/**
 * 인증 핸들러 (docs/api-spec.md §3.1) — signup / login / me 조회·편집.
 */
import { http } from 'msw'
import { PIN_RE } from '../../lib/pin'
import {
  db,
  issueAccessToken,
  issueRefreshToken,
  nextId,
  nowIso,
  resolveUserFromRefreshToken,
  revokeRefreshToken,
  type DbUser,
} from '../db'
import { persistUser, updatePersistedUser } from '../persist'
import {
  api,
  created,
  errorResponse,
  invalidBody,
  invalidRequest,
  noContent,
  ok,
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

/** PIN 형식 오류 — BE AUTH400 */
function invalidPin() {
  return errorResponse(400, 'AUTH400', 'PIN은 4자리 숫자여야 합니다.')
}

/** BE 코드 미확인 — 닉네임 중복 409는 채집되지 않았다 */
function nicknameConflict() {
  return errorResponse(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.')
}

/** 소셜 로그인 목 계정 닉네임 — provider별 1개 고정 (CHMO-359) */
const SOCIAL_MOCK_NICKNAMES: Record<string, string> = {
  kakao: '카카오테스트',
  google: '구글테스트',
  naver: '네이버테스트',
  apple: '애플테스트',
}

/** BE AuthResponse — user 객체 없이 평면 필드. 새 accessToken·refreshToken 쌍(회전) 발급 */
function authResponse(user: DbUser) {
  return {
    userId: user.id,
    nickname: user.nickname,
    accessToken: issueAccessToken(user.id),
    refreshToken: issueRefreshToken(user.id),
  }
}

export const authHandlers = [
  // POST /auth/signup — 계정 생성 · 화면 01-2
  http.post(api('/auth/signup'), async ({ request }) => {
    const body = await readJson<{ nickname?: unknown; pin?: unknown }>(request)
    const nickname = requiredString(body?.nickname)
    if (!nickname) return invalidRequest('닉네임을 입력해 주세요.')
    const pin = normalizePin(body?.pin)
    if (!pin) return invalidPin()
    if (nicknameTaken(nickname)) return nicknameConflict()

    const user = { id: nextId('usr'), nickname, pin, createdAt: nowIso() }
    db.users.push(user)
    persistUser(user) // 가입 계정은 localStorage 보존 — 새로고침(재시드) 후에도 유지
    return created(authResponse(user))
  }),

  // POST /auth/login — 로그인 · 화면 01-1
  http.post(api('/auth/login'), async ({ request }) => {
    const body = await readJson<{ nickname?: unknown; pin?: unknown }>(request)
    // 가입 때와 같은 정규화를 거쳐 비교 — trim/타입 차이로 정상 자격증명이 거부되지 않게
    const nickname = requiredString(body?.nickname)
    const pin = normalizePin(body?.pin)
    const user =
      nickname && pin ? db.users.find((u) => u.nickname === nickname && u.pin === pin) : undefined
    // BE AUTH401(로그인 실패) — 토큰 무효(COMMON401)와 구분된다
    if (!user) return errorResponse(401, 'AUTH401', '닉네임 또는 PIN이 일치하지 않습니다.')
    return ok(authResponse(user))
  }),

  // POST /auth/social/exchange — 소셜 콜백 일회용 코드 → 토큰 쌍 (CHMO-359)
  // 목 모드의 코드는 socialLoginStartUrl이 만든 `mock-social-<provider>` — 프로바이더별 고정
  // 계정을 find-or-create 한다(실 BE의 "소셜 신원으로 가입 또는 로그인"과 같은 의미).
  http.post(api('/auth/social/exchange'), async ({ request }) => {
    const body = await readJson<{ code?: unknown }>(request)
    const code = requiredString(body?.code)
    const provider = code?.startsWith('mock-social-') ? code.slice('mock-social-'.length) : null
    const nickname = provider ? SOCIAL_MOCK_NICKNAMES[provider] : undefined
    if (!nickname) {
      // 로컬 BE 스웨거 기준 OAUTH401(코드 무효/만료/재사용) — 실서버 미채집
      return errorResponse(401, 'OAUTH401', '소셜 로그인에 실패했습니다. 다시 시도해 주세요.')
    }
    let user = db.users.find((u) => u.nickname === nickname)
    if (!user) {
      // 소셜 계정은 PIN이 없다 — 빈 문자열은 PIN_RE에 걸려 닉네임+PIN 로그인으로는 진입 불가
      user = { id: nextId('usr'), nickname, pin: '', createdAt: nowIso() }
      db.users.push(user)
      persistUser(user) // 새로고침(재시드) 후에도 발급된 토큰의 주인이 남게
    }
    return ok(authResponse(user))
  }),

  // POST /auth/refresh — refreshToken으로 accessToken 재발급(회전) · CHMO-193
  http.post(api('/auth/refresh'), async ({ request }) => {
    const body = await readJson<{ refreshToken?: unknown }>(request)
    const refreshToken = requiredString(body?.refreshToken)
    const user = refreshToken ? resolveUserFromRefreshToken(refreshToken) : null
    // BE TOKEN401 — client.ts는 이 실패를 세션 종료로 처리한다(두 토큰 삭제)
    if (!user) return errorResponse(401, 'TOKEN401', '리프레시 토큰이 유효하지 않습니다.')
    // 회전: 쓴 refreshToken은 무효화하고 새 토큰 쌍을 발급 — 재사용(로그아웃 뒤 등) 시 401
    revokeRefreshToken(refreshToken as string)
    return ok(authResponse(user))
  }),

  // POST /auth/logout — refreshToken 서버 무효화(멱등) · CHMO-193
  http.post(api('/auth/logout'), async ({ request }) => {
    const body = await readJson<{ refreshToken?: unknown }>(request)
    const refreshToken = requiredString(body?.refreshToken)
    if (refreshToken) revokeRefreshToken(refreshToken)
    // 무효 토큰이어도 성공(멱등) — 클라이언트 로컬 로그아웃을 막지 않는다
    return noContent()
  }),

  // GET /me — 내 프로필 · 화면 설정
  http.get(api('/me'), ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    return ok(toUser(user))
  }),

  // PATCH /me — 프로필 편집(부분 업데이트) · 화면 설정
  http.patch(api('/me'), async ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    const body = await readJson<{ nickname?: unknown; pin?: unknown }>(request)
    if (!body) return invalidBody()

    const nickname = optionalString(body.nickname)
    if (nickname === null) return invalidRequest('닉네임을 입력해 주세요.')
    const pin = body.pin === undefined ? undefined : normalizePin(body.pin)
    if (pin === null) return invalidPin()
    if (nickname !== undefined && nicknameTaken(nickname, user.id)) return nicknameConflict()

    if (nickname !== undefined) user.nickname = nickname
    if (pin !== undefined) user.pin = pin
    updatePersistedUser(user) // 보존 대상(가입 계정)이면 localStorage에도 반영

    return ok(toUser(user))
  }),
]
