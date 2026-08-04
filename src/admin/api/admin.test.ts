/**
 * 어드민 api 계층 계약 테스트 (CHMO-379 — CHMO-219 방식).
 *
 * 픽스처는 BE CHMO-378 스펙 문서·admin/dto 소스 대조분(src/test/fixtures/be.ts) — 성공 응답은
 * 관리자 role이 있어야 실서버 채집이 가능해 아직 소스 기준이고, ADMIN403만 2026-08-04 실서버
 * 채집이다. 여기서 고정하는 계약: 요청 경로·쿼리 조립, 봉투 pageInfo 언랩(apiFetchPaged),
 * 매퍼의 키 누락·null 정규화, 시각 'Z' 보정, ADMIN403 → NOT_ADMIN 정규화.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { getAdminGroupDetail, getAdminProfile, getAdminStats, listAdminGroups } from './admin'
import { ApiRequestError } from '../../api/client'
import { setAuthTokens } from '../../lib/auth'
import {
  BE_ADMIN_GROUP_DETAIL,
  BE_ADMIN_GROUP_ROWS,
  BE_ADMIN_PAGE_INFO,
  BE_ADMIN_PROFILE,
  BE_ADMIN_STATS,
  BE_ERRORS,
  envelope,
} from '../../test/fixtures/be'
import { jsonResponse, stubFetch } from '../../test/http'

function serve(payload: unknown, status = 200) {
  return stubFetch(() => jsonResponse(payload, status))
}

beforeEach(() => {
  setAuthTokens({ accessToken: 'at', refreshToken: 'rt' })
})

describe('어드민 프로필 (GET /admin/me)', () => {
  it('AdminProfileResponse를 그대로 옮긴다 — FE 진입 게이트가 이 응답 하나로 판정한다', async () => {
    const calls = serve(envelope(BE_ADMIN_PROFILE))
    await expect(getAdminProfile()).resolves.toEqual({
      userId: 3,
      nickname: '김선생',
      role: 'ADMIN',
    })
    expect(calls[0].url).toBe('/api/v1/admin/me')
    expect(calls[0].headers.get('Authorization')).toBe('Bearer at')
  })

  it('비관리자 ADMIN403은 NOT_ADMIN으로 정규화된다(2026-08-04 실서버 채집)', async () => {
    serve(BE_ERRORS.ADMIN403.payload, BE_ERRORS.ADMIN403.status)
    const err = await getAdminProfile().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiRequestError)
    expect((err as ApiRequestError).status).toBe(403)
    expect((err as ApiRequestError).code).toBe('NOT_ADMIN')
    expect((err as ApiRequestError).message).toBe('관리자 권한이 필요합니다.')
  })
})

describe('어드민 대시보드 (GET /admin/stats)', () => {
  it('총계·최근 7일·최근 모임을 옮기고 오프셋 없는 시각에 Z를 붙인다', async () => {
    serve(envelope(BE_ADMIN_STATS))
    const stats = await getAdminStats()
    expect(stats.totals).toEqual({ users: 123, groups: 45, events: 210, photos: 8123 })
    expect(stats.last7Days).toEqual({ newGroups: 3, newEvents: 12, newPhotos: 950 })
    expect(stats.recentGroups).toEqual([
      { groupId: 45, name: '치즈유치원', memberCount: 8, createdAt: '2026-08-01T10:00:00Z' },
    ])
  })

  it('recentGroups 키가 생략돼도 빈 배열로 정규화된다', async () => {
    serve(envelope({ totals: BE_ADMIN_STATS.totals, last7Days: BE_ADMIN_STATS.last7Days }))
    const stats = await getAdminStats()
    expect(stats.recentGroups).toEqual([])
  })
})

describe('어드민 모임 목록 (GET /admin/groups)', () => {
  it('쿼리를 조립하고 봉투 pageInfo를 result와 함께 꺼낸다(apiFetchPaged)', async () => {
    const calls = stubFetch(() =>
      jsonResponse({
        isSuccess: true,
        code: 'COMMON200',
        message: '성공입니다.',
        pageInfo: BE_ADMIN_PAGE_INFO,
        result: BE_ADMIN_GROUP_ROWS,
      }),
    )

    const page = await listAdminGroups({ page: 0, size: 20, q: '치즈', sort: 'name,asc' })
    expect(calls[0].url).toBe('/api/v1/admin/groups?page=0&size=20&q=%EC%B9%98%EC%A6%88&sort=name%2Casc')
    expect(page.items).toEqual([
      {
        groupId: 45,
        name: '치즈유치원',
        memberCount: 8,
        eventCount: 12,
        photoCount: 830,
        createdAt: '2026-08-01T10:00:00Z',
      },
    ])
    expect(page.pageInfo).toEqual(BE_ADMIN_PAGE_INFO)
  })

  it('공백 q는 요청에 싣지 않는다 — URL이 곧 useApi 캐시 키다', async () => {
    const calls = serve(envelope([]))
    await listAdminGroups({ page: 1, q: '  ' })
    expect(calls[0].url).toBe('/api/v1/admin/groups?page=1')
  })

  it('pageInfo가 없거나 형태가 어긋나면 null로 접는다 — 목록은 그대로 온다', async () => {
    serve(envelope(BE_ADMIN_GROUP_ROWS))
    const page = await listAdminGroups({ page: 0 })
    expect(page.items).toHaveLength(1)
    expect(page.pageInfo).toBeNull()
  })
})

describe('어드민 모임 상세 (GET /admin/groups/:groupId)', () => {
  it('멤버(PENDING 포함)·이벤트(publishedAt null)를 정규화해 옮긴다', async () => {
    const calls = serve(envelope(BE_ADMIN_GROUP_DETAIL))
    const detail = await getAdminGroupDetail(45)
    expect(calls[0].url).toBe('/api/v1/admin/groups/45')
    expect(detail.name).toBe('치즈유치원')
    expect(detail.ownerNickname).toBe('김선생')
    expect(detail.members[1]).toEqual({
      userId: 9,
      nickname: '민준아빠',
      role: 'PARENT',
      status: 'PENDING',
      joinedAt: '2026-08-02T09:30:00Z',
    })
    expect(detail.events[0].publishedAt).toBe('2026-07-31T09:00:00Z')
    expect(detail.events[1].publishedAt).toBeNull()
    // eventDate는 날짜 문자열이라 Z 보정 대상이 아니다
    expect(detail.events[0].eventDate).toBe('2026-07-30')
  })

  it('members·events 키가 생략돼도 빈 배열로 정규화된다', async () => {
    serve(
      envelope({ groupId: 45, name: '치즈유치원', createdAt: '2026-08-01T10:00:00', memberCount: 0 }),
    )
    const detail = await getAdminGroupDetail(45)
    expect(detail.members).toEqual([])
    expect(detail.events).toEqual([])
    expect(detail.ownerUserId).toBeNull()
    expect(detail.ownerNickname).toBeNull()
  })

  it('없는 모임은 SPACE404 → NOT_FOUND(status 404)로 온다', async () => {
    serve(BE_ERRORS.SPACE404.payload, BE_ERRORS.SPACE404.status)
    const err = await getAdminGroupDetail(999999).catch((e: unknown) => e)
    expect((err as ApiRequestError).status).toBe(404)
    expect((err as ApiRequestError).code).toBe('NOT_FOUND')
  })
})
