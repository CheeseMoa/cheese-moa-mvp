/**
 * 인증 핸들러 (docs/api-spec.md §3.1) — signup / login / me 조회·편집.
 */
import { http } from 'msw'
import { PIN_RE } from '../../lib/pin'
import {
  AGREEMENT_CATALOG,
  db,
  deleteGroupCascade,
  issueAccessToken,
  issueRefreshToken,
  membershipsOfUser,
  nextId,
  nowIso,
  recordAgreement,
  removeMembershipCascade,
  resolveUserFromRefreshToken,
  revokeRefreshToken,
  teacherCountOf,
  type DbUser,
} from '../db'
import { persistUser, removePersistedUser, updatePersistedUser } from '../persist'
import { agreementTypeOf, STALE_VERSION } from './agreements'
import type { AgreementType } from '../../types/api'
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

/** 닉네임 중복 — BE AUTH409(ErrorStatus.NICKNAME_TAKEN 소스 대조, 2026-08-06 — 실서버 미채집) */
function nicknameConflict() {
  return errorResponse(409, 'AUTH409', '이미 사용 중인 닉네임입니다.')
}

/** 소셜 로그인 목 계정 닉네임 — provider별 1개 고정 (CHMO-359) */
const SOCIAL_MOCK_NICKNAMES: Record<string, string> = {
  kakao: '카카오테스트',
  google: '구글테스트',
  naver: '네이버테스트',
  apple: '애플테스트',
}

const SOCIAL_CODE_PREFIX = 'mock-social-'

/**
 * 이미 교환된 일회용 코드 — 실 BE가 코드를 1회 소진하는 계약을 목도 지킨다.
 * 이걸 안 지키면 콜백 화면의 StrictMode 이중 교환 가드가 깨져도 로컬에서는 멀쩡해 보인다.
 */
const spentSocialCodes = new Set<string>()

/** `mock-social-<provider>-<uuid>`에서 provider만 떼어낸다(provider명에는 '-'가 없다) */
function providerFromMockCode(code: string): string | null {
  if (!code.startsWith(SOCIAL_CODE_PREFIX)) return null
  return code.slice(SOCIAL_CODE_PREFIX.length).split('-')[0] || null
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
  // POST /auth/signup — 계정 생성 + 필수 동의 동봉(BE CHMO-598: 유저·동의 행이 한 트랜잭션.
  // agreements 없는 종전 요청은 VALID400 — FE 선반영이 배포 게이트인 이유).
  // 화면 호출부 없음(CHMO-557 — 01-2 삭제) · 계약 고정용. 검증 순서는 BE SignupUseCase 그대로:
  // bean(닉네임·목록 @NotEmpty·항목 @Valid) → PIN → 동의(스코프→버전→미동의→완전성) → 닉네임 중복
  http.post(api('/auth/signup'), async ({ request }) => {
    const body = await readJson<{ nickname?: unknown; pin?: unknown; agreements?: unknown }>(
      request,
    )
    const nickname = requiredString(body?.nickname)
    if (!nickname) return invalidRequest('닉네임을 입력해 주세요.')
    const items = body?.agreements
    if (!Array.isArray(items) || items.length === 0)
      return invalidRequest('약관 동의 목록은 필수입니다.')
    const pin = normalizePin(body?.pin)
    if (!pin) return invalidPin()

    // 한 항목이라도 거절되면 아무것도 저장하지 않는다(BE fail-fast) — 검증을 다 돌고 저장은 뒤에.
    // 항목별 규칙은 POST /agreements와 같고, 가입은 최초 기록이라 "필수 USER 항목 전부 동의"의
    // 완전성을 추가로 본다
    const submissions: { type: AgreementType; version: string; agreed: boolean }[] = []
    const agreedTypes = new Set<AgreementType>()
    for (const item of items as { type?: unknown; version?: unknown; agreed?: unknown }[]) {
      const catalog = agreementTypeOf(item?.type)
      if (!catalog) return invalidRequest('동의 항목은 필수입니다.')
      const version = requiredString(item?.version)
      if (!version) return invalidRequest('약관 버전은 필수입니다.')
      if (typeof item?.agreed !== 'boolean') return invalidRequest('동의 여부는 필수입니다.')

      if (catalog.scope !== 'user')
        return invalidRequest('모임 단위 동의 항목은 가입 시 제출할 수 없습니다.')
      if (version !== catalog.currentVersion) return invalidRequest(STALE_VERSION)
      if (catalog.required && !item.agreed) return invalidRequest('필수 동의 항목은 동의해야 합니다.')
      if (item.agreed) agreedTypes.add(catalog.type)
      submissions.push({ type: catalog.type, version: catalog.currentVersion, agreed: item.agreed })
    }
    for (const catalog of AGREEMENT_CATALOG) {
      if (catalog.scope === 'user' && catalog.required && !agreedTypes.has(catalog.type))
        return invalidRequest(`필수 동의 항목이 누락되었습니다: ${catalog.type.toUpperCase()}`)
    }

    if (nicknameTaken(nickname)) return nicknameConflict()

    // 신규 가입 기본 role = USER(BE와 동일 — 관리자 지정은 DB 직접 변경뿐, admin-spec §2-3)
    const user = { id: nextId('usr'), nickname, pin, role: 'USER' as const, createdAt: nowIso() }
    db.users.push(user)
    persistUser(user) // 가입 계정은 localStorage 보존 — 새로고침(재시드) 후에도 유지
    // 동의 행도 가입과 함께 기록 — 로그인 직후 게이트(GET /agreements, CHMO-479)가 pass로 지난다
    for (const submission of submissions) recordAgreement({ userId: user.id, ...submission })
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
    const provider = code ? providerFromMockCode(code) : null
    const nickname = provider ? SOCIAL_MOCK_NICKNAMES[provider] : undefined
    // BE OAUTH401 — 무효 코드와 이미 쓴 코드를 같은 실패로 다룬다(ExchangeSocialCodeUseCase와 동일)
    if (!nickname || !code || spentSocialCodes.has(code)) {
      return errorResponse(401, 'OAUTH401', '소셜 로그인에 실패했습니다. 다시 시도해 주세요.')
    }
    spentSocialCodes.add(code)
    let user = db.users.find((u) => u.nickname === nickname)
    if (!user) {
      // 소셜 계정은 PIN이 없다 — 빈 문자열은 PIN_RE에 걸려 닉네임+PIN 로그인으로는 진입 불가
      user = { id: nextId('usr'), nickname, pin: '', role: 'USER' as const, createdAt: nowIso() }
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

  // DELETE /me — 계정 삭제(회원 탈퇴 — App Store 5.1.1(v)) · 화면 설정 (CHMO-526 · 경로는
  // 실 BE 확정값, CHMO-524·575) — 파기 범위(ADR 019): 마지막 ACTIVE 선생님인 모임은
  // 모임째 삭제(CHMO-525 가드와 같은 판정 — 승인할 사람이 없는 고아 모임을 남기지 않는다),
  // 그 외 모임은 멤버십·매핑만 정리. 동의 이력은 FK 없는 append-only 증빙이라 보존한다.
  // 분석 중 가드(MOMENT409)는 여기 없다 — 실 BE도 계정 삭제는 분석 중이어도 막지 않는다.
  http.delete(api('/me'), ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    for (const membership of membershipsOfUser(user.id)) {
      const lastTeacher =
        membership.role === 'teacher' &&
        membership.status === 'active' &&
        teacherCountOf(membership.groupId) <= 1
      if (lastTeacher) deleteGroupCascade(membership.groupId)
      else removeMembershipCascade(membership)
    }
    // 목 토큰은 자기서술형(userId 참조)이라 유저 행이 사라지면 access·refresh 모두 즉시 무효 —
    // "같은 계정으로 재로그인 불가·리프레시 401" AC까지 이 삭제가 담당한다
    db.users = db.users.filter((u) => u.id !== user.id)
    removePersistedUser(user.id) // 가입 보존분도 삭제 — 새로고침(재시드) 후 재로그인도 막는다
    return ok(null)
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
