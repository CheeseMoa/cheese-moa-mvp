import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiRequestError,
  apiFetch,
  redirectIfUnauthorized,
  toErrorMessage,
  toErrorReference,
} from './client'
import { clearRefreshToken, getAccessToken, getRefreshToken, setAuthTokens } from '../lib/auth'
import { getViewerToken, setViewerToken } from '../lib/viewer'
import { BE_ERRORS, envelope, errorEnvelope } from '../test/fixtures/be'
import { bodyOf, emptyResponse, jsonResponse, stubFetch, textResponse } from '../test/http'

const REFRESH_URL = '/api/v1/auth/refresh'

/** 응답 봉투 · 시각 보정 · 401 자동 재발급 — 화면이 절대 보지 않는 transport 계약 */
describe('apiFetch — 응답 흡수', () => {
  it('봉투는 result만 돌려준다', async () => {
    stubFetch(() => jsonResponse(envelope({ groupId: 6, name: '해바라기반' })))
    await expect(apiFetch('/groups/6')).resolves.toEqual({ groupId: 6, name: '해바라기반' })
  })

  it('bare 배열 result도 그대로 돌려준다 — 목록 응답은 감싸지 않는다', async () => {
    stubFetch(() => jsonResponse(envelope([{ groupId: 6 }])))
    await expect(apiFetch('/groups')).resolves.toEqual([{ groupId: 6 }])
  })

  it('204는 본문을 읽지 않고 undefined를 돌려준다', async () => {
    stubFetch(() => emptyResponse(204))
    await expect(apiFetch('/photos')).resolves.toBeUndefined()
  })

  it('오프셋 없는 UTC 시각에만 Z를 붙인다 — 오프셋이 이미 있거나 날짜뿐이면 그대로', async () => {
    stubFetch(() =>
      jsonResponse(
        envelope({
          createdAt: '2026-07-10T03:33:06.41365825',
          publishedAt: '2026-07-10T03:33:06.314638Z',
          seededAt: '2026-06-27T09:41:00+09:00',
          eventDate: '2026-07-10',
          nested: { at: '2026-07-10T03:33:06' },
          list: [{ at: '2026-07-10T03:33:06.1' }],
          uploadUrl: 'https://s3/obj.jpg?X-Amz-Date=20260710T043130Z',
        }),
      ),
    )

    await expect(apiFetch('/events/4')).resolves.toEqual({
      createdAt: '2026-07-10T03:33:06.41365825Z',
      publishedAt: '2026-07-10T03:33:06.314638Z',
      seededAt: '2026-06-27T09:41:00+09:00',
      eventDate: '2026-07-10',
      nested: { at: '2026-07-10T03:33:06Z' },
      list: [{ at: '2026-07-10T03:33:06.1Z' }],
      uploadUrl: 'https://s3/obj.jpg?X-Amz-Date=20260710T043130Z',
    })
  })
})

describe('apiFetch — 실패', () => {
  it('실패 봉투는 FE 의미 코드로 정규화해 던진다', async () => {
    const { status, payload } = BE_ERRORS.AUTH401
    stubFetch(() => jsonResponse(payload, status))

    const err = await apiFetch('/auth/login', { auth: 'none' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiRequestError)
    expect(err).toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: '닉네임 또는 PIN이 일치하지 않습니다.',
    })
  })

  it('HTTP 200이어도 isSuccess:false면 실패다', async () => {
    stubFetch(() => jsonResponse(errorEnvelope('JOIN403', '비밀번호가 일치하지 않습니다.'), 200))
    await expect(apiFetch('/groups/join')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
  })

  it('매핑에 없는 코드는 그대로 통과한다 — BE message는 이미 한국어다', async () => {
    const { status, payload } = BE_ERRORS.PHOTO400
    stubFetch(() => jsonResponse(payload, status))

    await expect(apiFetch('/events/4/photos/presign', { method: 'POST' })).rejects.toMatchObject({
      status: 400,
      code: 'PHOTO400',
      message: '지원하지 않는 파일 형식입니다.',
    })
  })

  it('봉투가 아닌 실패는 UNKNOWN — 원문이 사용자에게 새지 않는다', async () => {
    stubFetch(() => textResponse('Bad Gateway', 502))

    const err = await apiFetch('/groups').catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 502, code: 'UNKNOWN' })
    expect(toErrorMessage(err)).toBe('요청에 실패했어요. 잠시 후 다시 시도해 주세요.')
  })
})

describe('apiFetch — 토큰 첨부', () => {
  beforeEach(() => setAuthTokens({ accessToken: 'at', refreshToken: 'rt' }))

  it('기본(creator)은 accessToken을 Bearer로 붙인다', async () => {
    const calls = stubFetch(() => jsonResponse(envelope(null)))
    await apiFetch('/me')
    expect(calls[0].headers.get('Authorization')).toBe('Bearer at')
  })

  it("auth:'none'은 토큰이 있어도 붙이지 않는다 — 로그인·로그아웃·재발급 경로", async () => {
    const calls = stubFetch(() => jsonResponse(envelope(null)))
    await apiFetch('/auth/logout', { method: 'POST', auth: 'none', body: { refreshToken: 'rt' } })

    expect(calls[0].headers.has('Authorization')).toBe(false)
    expect(calls[0].headers.get('Content-Type')).toBe('application/json')
    expect(bodyOf(calls[0])).toEqual({ refreshToken: 'rt' })
  })

  it("auth:'viewer'는 모임 공유 token별 뷰어 토큰을 붙인다", async () => {
    setViewerToken('shr_grp1', 'vt')
    const calls = stubFetch(() => jsonResponse(envelope([])))
    await apiFetch('/share/shr_grp1', { auth: 'viewer', viewerShareToken: 'shr_grp1' })

    expect(calls[0].headers.get('Authorization')).toBe('Bearer vt')
  })
})

describe('apiFetch — accessToken 자동 재발급 (CHMO-193)', () => {
  beforeEach(() => setAuthTokens({ accessToken: 'expired', refreshToken: 'r1' }))

  /** 만료된 accessToken엔 401, 재발급받은 새 토큰엔 200 */
  function stubExpiredThenFresh(refresh: () => Response) {
    return stubFetch((call) => {
      if (call.url === REFRESH_URL) return refresh()
      return call.headers.get('Authorization') === 'Bearer fresh'
        ? jsonResponse(envelope({ ok: true }))
        : jsonResponse(BE_ERRORS.COMMON401.payload, BE_ERRORS.COMMON401.status)
    })
  }

  const freshTokens = () => jsonResponse(envelope({ accessToken: 'fresh', refreshToken: 'r2' }))

  it('401을 받으면 refreshToken으로 한 번 재발급하고 원 요청을 재시도한다', async () => {
    const calls = stubExpiredThenFresh(freshTokens)

    await expect(apiFetch('/groups')).resolves.toEqual({ ok: true })

    const refreshCalls = calls.filter((c) => c.url === REFRESH_URL)
    expect(refreshCalls).toHaveLength(1)
    // 재발급 요청엔 만료된 accessToken을 붙이지 않는다(인터셉터 자기 재귀 방지)
    expect(refreshCalls[0].headers.has('Authorization')).toBe(false)
    expect(bodyOf(refreshCalls[0])).toEqual({ refreshToken: 'r1' })
    // 회전된 refreshToken까지 함께 저장된다
    expect(getAccessToken()).toBe('fresh')
    expect(getRefreshToken()).toBe('r2')
  })

  it('동시 요청 3개가 401을 받아도 재발급은 한 번만 한다', async () => {
    const calls = stubExpiredThenFresh(freshTokens)

    const results = await Promise.all([apiFetch('/groups'), apiFetch('/events/4'), apiFetch('/me')])

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    expect(calls.filter((c) => c.url === REFRESH_URL)).toHaveLength(1)
  })

  it('재발급이 TOKEN401로 실패하면 두 토큰을 모두 지운다', async () => {
    const calls = stubExpiredThenFresh(() =>
      jsonResponse(BE_ERRORS.TOKEN401.payload, BE_ERRORS.TOKEN401.status),
    )

    await expect(apiFetch('/groups')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    expect(calls.filter((c) => c.url === REFRESH_URL)).toHaveLength(1)
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('재발급에 성공해도 재시도가 또 401이면 재발급을 반복하지 않고 세션을 끝낸다', async () => {
    const calls = stubFetch((call) =>
      call.url === REFRESH_URL
        ? freshTokens()
        : jsonResponse(BE_ERRORS.COMMON401.payload, BE_ERRORS.COMMON401.status),
    )

    await expect(apiFetch('/groups')).rejects.toMatchObject({ status: 401 })
    expect(calls.filter((c) => c.url === REFRESH_URL)).toHaveLength(1)
    expect(getAccessToken()).toBeNull()
  })

  it('refreshToken이 없으면 재발급을 시도하지 않고 바로 세션을 끝낸다', async () => {
    clearRefreshToken()
    const calls = stubFetch(() =>
      jsonResponse(BE_ERRORS.COMMON401.payload, BE_ERRORS.COMMON401.status),
    )

    await expect(apiFetch('/groups')).rejects.toMatchObject({ status: 401 })
    expect(calls.filter((c) => c.url === REFRESH_URL)).toHaveLength(0)
    expect(getAccessToken()).toBeNull()
  })

  it('뷰어 401은 재발급 대상이 아니다 — 그 공유 토큰만 지우고 제작자 세션은 건드리지 않는다', async () => {
    setViewerToken('shr_grp1', 'vt')
    const calls = stubFetch(() =>
      jsonResponse(BE_ERRORS.COMMON401.payload, BE_ERRORS.COMMON401.status),
    )

    await expect(
      apiFetch('/share/shr_grp1', { auth: 'viewer', viewerShareToken: 'shr_grp1' }),
    ).rejects.toMatchObject({ status: 401 })

    expect(calls.filter((c) => c.url === REFRESH_URL)).toHaveLength(0)
    expect(getViewerToken('shr_grp1')).toBeNull()
    expect(getAccessToken()).toBe('expired')
  })

  it("auth:'none' 요청의 401은 세션 문제가 아니다 — 로그인 실패로 토큰이 지워지면 안 된다", async () => {
    const calls = stubFetch(() => jsonResponse(BE_ERRORS.AUTH401.payload, BE_ERRORS.AUTH401.status))

    await expect(apiFetch('/auth/login', { auth: 'none' })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    })
    expect(calls).toHaveLength(1)
    expect(getAccessToken()).toBe('expired')
  })
})

/**
 * 요청 추적 ID(CHMO-500) — 본문이 아니라 헤더에 실리는 계약이라 매퍼도 봉투도 안 지켜 준다.
 * 실 BE 실측값(2026-07-30): 12자 hex + `access-control-expose-headers: X-Request-Id`.
 */
describe('apiFetch — 요청 추적 ID', () => {
  const failWithRequestId = (requestId: string) =>
    jsonResponse(BE_ERRORS.PHOTO400.payload, BE_ERRORS.PHOTO400.status, {
      'X-Request-Id': requestId,
    })

  it('실패 응답의 X-Request-Id를 예외에 실어 화면까지 보낸다', async () => {
    stubFetch(() => failWithRequestId('db0cdc31fb2c'))

    const err = await apiFetch('/events/4/photos/presign', { method: 'POST' }).catch(
      (e: unknown) => e,
    )
    expect(err).toMatchObject({ code: 'PHOTO400', requestId: 'db0cdc31fb2c' })
    expect(toErrorReference(err)).toBe('PHOTO400 · db0cdc31fb2c')
  })

  it('봉투가 아닌 실패(프록시 오류)도 헤더가 있으면 함께 싣는다', async () => {
    stubFetch(() => textResponse('Bad Gateway', 502, { 'X-Request-Id': 'aa11bb22cc33' }))

    const err = await apiFetch('/groups').catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 502, code: 'UNKNOWN', requestId: 'aa11bb22cc33' })
    // 사용자에게 보이는 문구는 여전히 일반 문구 — 식별 줄만 따로 붙는다
    expect(toErrorMessage(err)).toBe('요청에 실패했어요. 잠시 후 다시 시도해 주세요.')
    expect(toErrorReference(err)).toBe('UNKNOWN · aa11bb22cc33')
  })

  it('헤더가 없으면 null — 짚을 로그가 없어 화면도 아무것도 그리지 않는다', async () => {
    stubFetch(() => jsonResponse(BE_ERRORS.PHOTO400.payload, BE_ERRORS.PHOTO400.status))

    const err = await apiFetch('/events/4/photos/presign', { method: 'POST' }).catch(
      (e: unknown) => e,
    )
    expect(err).toMatchObject({ code: 'PHOTO400', requestId: null })
    expect(toErrorReference(err)).toBeNull()
  })

  it('형식을 벗어난 값은 버린다 — 화면에 그대로 노출되는 값이다', async () => {
    // 한글 등 비Latin-1 값은 헤더 자체에 담기지 않으므로(ByteString) 여기 목록은 전부 ASCII다
    for (const bogus of ['a'.repeat(65), 'id with space', '<script>', '']) {
      stubFetch(() => failWithRequestId(bogus))
      const err = await apiFetch('/events/4/photos/presign', { method: 'POST' }).catch(
        (e: unknown) => e,
      )
      expect(err).toMatchObject({ requestId: null })
    }
  })

  it('재발급 후 재시도가 또 실패하면 재시도 응답의 ID를 든다 — 첫 401의 것이 아니다', async () => {
    setAuthTokens({ accessToken: 'expired', refreshToken: 'r1' })
    let attempt = 0
    stubFetch((call) => {
      if (call.url === REFRESH_URL) {
        return jsonResponse(envelope({ accessToken: 'fresh', refreshToken: 'r2' }))
      }
      attempt += 1
      return jsonResponse(BE_ERRORS.COMMON401.payload, BE_ERRORS.COMMON401.status, {
        'X-Request-Id': attempt === 1 ? 'first0000001' : 'retry0000002',
      })
    })

    await expect(apiFetch('/groups')).rejects.toMatchObject({ requestId: 'retry0000002' })
  })

  it('네트워크 실패엔 응답이 없어 식별 줄도 없다', () => {
    expect(toErrorReference(new ApiRequestError(0, 'NETWORK_ERROR', 'Failed to fetch'))).toBeNull()
    expect(toErrorReference(new TypeError('Failed to fetch'))).toBeNull()
  })
})

describe('redirectIfUnauthorized', () => {
  it('401이면 재인증 화면으로 보내고 true', () => {
    const navigate = vi.fn()
    expect(redirectIfUnauthorized(new ApiRequestError(401, 'UNAUTHORIZED', ''), navigate)).toBe(
      true,
    )
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true, state: undefined })
  })

  it('뷰어 흐름은 잠금 해제 경로로, 초대 흐름은 returnTo를 실어 보낸다', () => {
    const navigate = vi.fn()
    redirectIfUnauthorized(new ApiRequestError(401, 'UNAUTHORIZED', ''), navigate, {
      to: '/share/shr_grp1',
      state: { returnTo: '/join/abc' },
    })
    expect(navigate).toHaveBeenCalledWith('/share/shr_grp1', {
      replace: true,
      state: { returnTo: '/join/abc' },
    })
  })

  it('401이 아니거나 API 예외가 아니면 아무것도 하지 않고 false', () => {
    const navigate = vi.fn()
    expect(redirectIfUnauthorized(new ApiRequestError(404, 'NOT_FOUND', ''), navigate)).toBe(false)
    expect(redirectIfUnauthorized(new Error('boom'), navigate)).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('toErrorMessage', () => {
  it('네트워크 실패와 정체불명 실패는 일반 문구로 가린다', () => {
    expect(toErrorMessage(new ApiRequestError(0, 'NETWORK_ERROR', 'Failed to fetch'))).toBe(
      '네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
    )
    expect(toErrorMessage(new TypeError('Failed to fetch'))).toBe(
      '네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
    )
    expect(toErrorMessage(new ApiRequestError(500, 'UNKNOWN', 'Internal Server Error'))).toBe(
      '요청에 실패했어요. 잠시 후 다시 시도해 주세요.',
    )
  })

  it('BE message는 이미 한국어라 그대로 노출한다', () => {
    const err = new ApiRequestError(
      401,
      'INVALID_CREDENTIALS',
      '닉네임 또는 PIN이 일치하지 않습니다.',
    )
    expect(toErrorMessage(err)).toBe('닉네임 또는 PIN이 일치하지 않습니다.')
  })
})
