/**
 * 어드민 api 계층 계약 테스트 (CHMO-379 — CHMO-219 방식).
 *
 * 픽스처는 BE CHMO-378 스펙 문서·admin/dto 소스 대조분(src/test/fixtures/be.ts) — 성공 응답은
 * 관리자 role이 있어야 실서버 채집이 가능해 아직 소스 기준이고, ADMIN403만 2026-08-04 실서버
 * 채집이다. 여기서 고정하는 계약: 요청 경로·쿼리 조립, 봉투 pageInfo 언랩(apiFetchPaged),
 * 매퍼의 키 누락·null 정규화, 시각 'Z' 보정, ADMIN403 → NOT_ADMIN 정규화.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  adjustAdminUserCredits,
  adminLogin,
  adminLogout,
  cancelAdminCampaign,
  changeAdminGroupBillingScope,
  getAdminOrganizationSubscriptionHistory,
  getAdminUserCredits,
  getAdminUserSummary,
  grantAdminGroupPass,
  listAdminOrganizationSubscriptions,
  registerAdminSubscriptionPeriod,
  revokeAdminPassGrant,
  searchAdminUsers,
  voidAdminSubscriptionPeriod,
  createAdminCampaign,
  createAdminPopup,
  deleteAdminPopup,
  getAdminCampaignRecipients,
  getAdminGroupDetail,
  listAdminCampaigns,
  listAdminPopups,
  presignAdminPopupImage,
  putAdminPopupImage,
  setAdminPopupActive,
  testAdminCampaign,
  updateAdminPopup,
  getAdminProfile,
  getAdminStats,
  listAdminGroups,
  getAdminReport,
  listAdminInquiries,
  listAdminReports,
  replyAdminReport,
  updateAdminInquiryStatus,
  updateAdminReportStatus,
} from './admin'
import { ApiRequestError } from '../../api/client'
import { getAccessToken, getRefreshToken, setAuthTokens } from '../../lib/auth'
import type { AdminPopupInput } from './types'
import {
  BE_ADMIN_BILLING_SCOPE,
  BE_ADMIN_CAMPAIGN_RECIPIENTS,
  BE_ADMIN_CAMPAIGN_SCHEDULED,
  BE_ADMIN_CAMPAIGN_TEST_SENT,
  BE_ADMIN_CAMPAIGN_UNKNOWN,
  BE_ADMIN_CREDIT_ADJUSTMENT,
  BE_ADMIN_PASS_GRANT,
  BE_ADMIN_PASS_GRANT_REVOKE,
  BE_ADMIN_SUBSCRIPTION,
  BE_ADMIN_SUBSCRIPTION_HISTORY,
  BE_ADMIN_SUBSCRIPTION_ROWS,
  BE_ADMIN_USER_CREDITS,
  BE_ADMIN_USER_SEARCH,
  BE_ADMIN_USER_SUMMARY,
  BE_ADMIN_GROUP_DETAIL,
  BE_ADMIN_GROUP_DETAIL_INSTITUTION,
  BE_ADMIN_GROUP_ROWS,
  BE_ADMIN_INQUIRY_ROWS,
  BE_ADMIN_PAGE_INFO,
  BE_ADMIN_POPUP,
  BE_ADMIN_POPUP_IMAGE,
  BE_ADMIN_POPUP_SPARSE,
  BE_ADMIN_PROFILE,
  BE_ADMIN_REPORT_DETAIL,
  BE_ADMIN_REPORT_DETAIL_SPARSE,
  BE_ADMIN_REPORT_PHOTO_DETAIL,
  BE_ADMIN_REPORT_ROWS,
  BE_ADMIN_STATS,
  BE_ERRORS,
  envelope,
} from '../../test/fixtures/be'
import { bodyOf, jsonResponse, stubFetch } from '../../test/http'

function serve(payload: unknown, status = 200) {
  return stubFetch(() => jsonResponse(payload, status))
}

beforeEach(() => {
  setAuthTokens({ accessToken: 'at', refreshToken: 'rt' })
})

describe('어드민 로그인 (POST /auth/admin/login — CHMO-934)', () => {
  it('토큰 미첨부로 관리자 비밀번호를 보내고, 성공 시 토큰 쌍을 저장한다', async () => {
    const calls = serve(
      envelope({
        userId: 2,
        nickname: '스테이징테스트',
        accessToken: 'new-at',
        refreshToken: 'new-rt',
      }),
    )
    await adminLogin({ nickname: '스테이징테스트', password: 'long-admin-password' })
    expect(calls[0].url).toBe('/api/v1/auth/admin/login')
    expect(calls[0].method).toBe('POST')
    // 로그인 요청에 기존(만료) 토큰이 붙으면 안 된다 — auth: 'none'
    expect(calls[0].headers.get('Authorization')).toBeNull()
    expect(bodyOf(calls[0])).toEqual({
      nickname: '스테이징테스트',
      password: 'long-admin-password',
    })
    expect(getAccessToken()).toBe('new-at')
    expect(getRefreshToken()).toBe('new-rt')
  })

  it('AUTH401(자격 오류)은 INVALID_CREDENTIALS로 오고 기존 토큰을 건드리지 않는다', async () => {
    serve(
      { isSuccess: false, code: 'AUTH401', message: '닉네임 또는 비밀번호가 일치하지 않습니다.' },
      401,
    )
    const err = await adminLogin({ nickname: 'x', password: 'wrong-admin-password' }).catch(
      (e: unknown) => e,
    )
    expect((err as ApiRequestError).code).toBe('INVALID_CREDENTIALS')
    expect((err as ApiRequestError).message).toBe('닉네임 또는 비밀번호가 일치하지 않습니다.')
    expect(getAccessToken()).toBe('at') // beforeEach 세션 그대로 — auth: 'none'이라 401이 토큰을 지우지 않는다
  })
})

describe('어드민 로그아웃 (POST /auth/logout — CHMO-595)', () => {
  it('refreshToken을 실어 서버 무효화 후 로컬 토큰을 지운다(auth 미첨부)', async () => {
    const calls = serve(envelope(null))
    await adminLogout()
    expect(calls[0].url).toBe('/api/v1/auth/logout')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].headers.get('Authorization')).toBeNull()
    expect(bodyOf(calls[0])).toEqual({ refreshToken: 'rt' })
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('서버 호출이 실패해도 로컬 로그아웃은 진행한다 — 화면 복귀가 네트워크에 안 막힌다', async () => {
    serve({ isSuccess: false, code: 'COMMON500', message: '서버 에러' }, 500)
    await adminLogout()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })
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
    expect(stats.last7Days).toEqual({
      newGroups: 3,
      newEvents: 12,
      newPhotos: 950,
      activeGroups: 7,
      uploaders: 9,
    })
    expect(stats.recentGroups).toEqual([
      { groupId: 45, memberCount: 8, createdAt: '2026-08-01T10:00:00Z' },
    ])
    // 최근 업로드(CHMO-932) — 반영 시각은 LocalDateTime이라 Z 보정, 업로더 없는 옛 사진은 둘 다 null
    expect(stats.recentUploads[0]).toEqual({
      eventId: 101,
      eventName: '가을 소풍',
      groupId: 45,
      groupType: 'BUSINESS',
      lastUploadedAt: '2026-10-16T09:12:00Z',
      photoCount: 120,
      uploaderUserId: 3,
      uploaderNickname: '김선생',
    })
    expect(stats.recentUploads[1]).toMatchObject({ uploaderUserId: null, uploaderNickname: null })
    expect(stats.excludedUserIds).toEqual([17, 34])
  })

  it('구계약(CHMO-932 전) 응답 — recentGroups·recentUploads·활동 키가 없어도 빈 값으로 정규화된다', async () => {
    serve(
      envelope({
        totals: BE_ADMIN_STATS.totals,
        last7Days: { newGroups: 3, newEvents: 12, newPhotos: 950 },
      }),
    )
    const stats = await getAdminStats()
    expect(stats.recentGroups).toEqual([])
    expect(stats.recentUploads).toEqual([])
    expect(stats.excludedUserIds).toEqual([])
    expect(stats.last7Days).toMatchObject({ activeGroups: 0, uploaders: 0 })
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

    const page = await listAdminGroups({ page: 0, size: 20, sort: 'createdAt,asc' })
    expect(calls[0].url).toBe('/api/v1/admin/groups?page=0&size=20&sort=createdAt%2Casc')
    expect(page.items).toEqual([
      {
        groupId: 45,
        groupType: 'BUSINESS', // CHMO-621 이후 BE가 싣는다 — 목록 `유형` 열(CHMO-931)
        memberCount: 8,
        eventCount: 12,
        photoCount: 830,
        createdAt: '2026-08-01T10:00:00Z',
        lastUploadedAt: '2026-10-16T09:12:00Z', // CHMO-932 — LocalDateTime이라 Z 보정
        last7DaysPhotoCount: 120,
      },
    ])
    expect(page.pageInfo).toEqual(BE_ADMIN_PAGE_INFO)
  })

  it('정렬을 안 넘기면 page만 실린다 — URL이 곧 useApi 캐시 키다', async () => {
    const calls = serve(envelope([]))
    await listAdminGroups({ page: 1 })
    expect(calls[0].url).toBe('/api/v1/admin/groups?page=1')
  })

  it('유형 필터·최근 업로드 정렬(CHMO-932)을 싣고, 사진 없는 모임의 lastUploadedAt은 null로 접는다', async () => {
    const calls = serve(
      envelope([{ ...BE_ADMIN_GROUP_ROWS[0], groupType: 'GENERAL', lastUploadedAt: null, last7DaysPhotoCount: 0 }]),
    )
    const page = await listAdminGroups({ page: 0, sort: 'lastUploadedAt,desc', groupType: 'GENERAL' })
    expect(calls[0].url).toBe('/api/v1/admin/groups?page=0&sort=lastUploadedAt%2Cdesc&groupType=GENERAL')
    expect(page.items[0]).toMatchObject({ groupType: 'GENERAL', lastUploadedAt: null, last7DaysPhotoCount: 0 })
    // 구계약 행(키 없음)도 같은 값
    serve(envelope([{ groupId: 45, createdAt: '2026-08-01T10:00:00' }]))
    const legacy = await listAdminGroups({ page: 0 })
    expect(legacy.items[0]).toMatchObject({ lastUploadedAt: null, last7DaysPhotoCount: 0 })
  })

  // FE 선배포 구간(BE PR #203 배포 전)에는 아직 name이 실려 온다 — 매퍼가 통째로 흘려보내야
  // 화면 타입에 없는 값이 새지 않는다(CHMO-670)
  it('BE가 아직 모임 name을 보내도 행에 담지 않는다', async () => {
    serve(envelope([{ ...BE_ADMIN_GROUP_ROWS[0], name: '치즈유치원' }]))
    const page = await listAdminGroups({ page: 0 })
    expect(page.items[0]).not.toHaveProperty('name')
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
    expect(detail.groupId).toBe(45)
    // 모임 이름은 응답에 없다(CHMO-668) — 이벤트 이름·닉네임은 그대로 온다
    expect(detail).not.toHaveProperty('name')
    expect(detail.ownerNickname).toBe('김선생')
    expect(detail.members[1]).toEqual({
      userId: 9,
      nickname: '민준아빠',
      role: 'VIEWER',
      status: 'PENDING',
      joinedAt: '2026-08-02T09:30:00Z',
      accountType: 'PERSONAL', // CHMO-932 A-7 — 모임 역할과 다른 축(계정 유형)
    })
    expect(detail.events[0].publishedAt).toBe('2026-07-31T09:00:00Z')
    expect(detail.events[1].publishedAt).toBeNull()
    // eventDate는 날짜 문자열이라 Z 보정 대상이 아니다
    expect(detail.events[0].eventDate).toBe('2026-07-30')
    expect(detail.events[0].lastUploadedAt).toBe('2026-10-16T09:12:00Z')
    expect(detail.events[1].lastUploadedAt).toBeNull()
  })

  it('과금·패스(CHMO-932) — 개인 범위는 institution null·지급 이력 정규화, 기관 범위는 institution이 찬다', async () => {
    serve(envelope(BE_ADMIN_GROUP_DETAIL))
    const personal = await getAdminGroupDetail(45)
    expect(personal).toMatchObject({
      groupType: 'BUSINESS',
      billingScope: 'PERSONAL',
      billingOwnerUserId: 3,
      billingOwnerNickname: '김선생',
      lastUploadedAt: '2026-10-16T09:12:00Z',
      institution: null,
    })
    expect(personal.pass.active).toBe(true)
    expect(personal.pass.accessUntil).toBe('2026-10-23T03:00:00Z')
    expect(personal.pass.grants[0]).toEqual({
      grantId: 7,
      plan: 'DAY_7',
      accessFrom: '2026-10-16T03:00:00Z',
      accessUntil: '2026-10-23T03:00:00Z',
      adminId: 17,
      memo: '설문 참여 보상',
      createdAt: '2026-10-16T12:00:00Z', // BaseEntity 시각 — Z 보정
      revokedAt: null,
      revokedBy: null,
    })

    serve(envelope(BE_ADMIN_GROUP_DETAIL_INSTITUTION))
    const institution = await getAdminGroupDetail(45)
    expect(institution.billingScope).toBe('INSTITUTION')
    expect(institution.institution).toEqual({
      accessStatus: 'GRACE',
      accessUntil: '2026-10-10T00:00:00Z',
      graceEndsAt: '2026-10-17T00:00:00Z',
    })
    expect(institution.pass).toEqual({ active: false, accessUntil: null, grants: [] })
    expect(institution.members[0].accountType).toBe('ORGANIZATION')
  })

  it('members·events 키가 생략돼도 빈 배열로 정규화된다 · 구계약(과금 키 없음)은 범위 null·패스 빈 객체·계정 개인', async () => {
    serve(envelope({ groupId: 45, createdAt: '2026-08-01T10:00:00', memberCount: 0 }))
    const detail = await getAdminGroupDetail(45)
    expect(detail.members).toEqual([])
    expect(detail.events).toEqual([])
    expect(detail.ownerUserId).toBeNull()
    expect(detail.ownerNickname).toBeNull()
    // 모르는 과금 범위를 '개인'으로 단정하면 기관 모임에도 [패스 지급]이 선다 — null로 둬 버튼을 잠근다
    expect(detail.billingScope).toBeNull()
    expect(detail.groupType).toBe('BUSINESS')
    expect(detail.pass).toEqual({ active: false, accessUntil: null, grants: [] })
    expect(detail.institution).toBeNull()

    serve(envelope({ ...BE_ADMIN_GROUP_DETAIL, members: [{ userId: 3, nickname: '김선생', role: 'EDITOR', status: 'ACTIVE', joinedAt: '2026-08-01T10:00:00' }] }))
    const legacyMember = await getAdminGroupDetail(45)
    expect(legacyMember.members[0].accountType).toBe('PERSONAL')
  })

  it('없는 모임은 SPACE404 → NOT_FOUND(status 404)로 온다', async () => {
    serve(BE_ERRORS.SPACE404.payload, BE_ERRORS.SPACE404.status)
    const err = await getAdminGroupDetail(999999).catch((e: unknown) => e)
    expect((err as ApiRequestError).status).toBe(404)
    expect((err as ApiRequestError).code).toBe('NOT_FOUND')
  })
})

describe('기관 도입 문의 목록 (GET /admin/organization-inquiries — CHMO-811)', () => {
  it('status·page·size를 조립하고 봉투 pageInfo를 함께 꺼낸다', async () => {
    const calls = stubFetch(() =>
      jsonResponse({
        isSuccess: true,
        code: 'COMMON200',
        message: '성공입니다.',
        pageInfo: BE_ADMIN_PAGE_INFO,
        result: BE_ADMIN_INQUIRY_ROWS,
      }),
    )

    const page = await listAdminInquiries({ page: 0, size: 20, status: 'RECEIVED,CONTACTED' })
    expect(calls[0].url).toBe(
      '/api/v1/admin/organization-inquiries?page=0&size=20&status=RECEIVED%2CCONTACTED',
    )
    expect(page.pageInfo).toEqual(BE_ADMIN_PAGE_INFO)
    expect(page.items[0]).toEqual({
      id: 12,
      status: 'RECEIVED',
      organizationType: 'KINDERGARTEN',
      organizationName: '치즈유치원',
      region: '서울',
      contactName: '김선생',
      // 마스킹하지 않는다 — 관리자 전용 화면에서 전화를 거는 값이다(CHMO-802)
      contactPhone: '01012345678',
      contactRole: 'DIRECTOR',
      privacyConsentVersion: '1.0',
      userId: 7,
      userNickname: '치즈',
      socialProviders: ['KAKAO'],
      createdAt: '2026-09-15T10:00:00+09:00',
      updatedAt: '2026-09-15T10:00:00+09:00',
    })
  })

  it('선택 항목이 빈 행 — contactRole은 null, PIN 계정은 socialProviders 빈 배열', async () => {
    serve(envelope(BE_ADMIN_INQUIRY_ROWS))
    const page = await listAdminInquiries({ page: 0 })
    expect(page.items[1].contactRole).toBeNull()
    expect(page.items[1].socialProviders).toEqual([])
    // 오프셋 없는 시각에는 Z가 붙는다(client.ts 보정)
    expect(page.items[1].updatedAt).toBe('2026-09-14T11:30:00Z')
  })

  it('socialProviders 키가 생략돼도 빈 배열로 정규화된다', async () => {
    const { socialProviders, ...withoutProviders } = BE_ADMIN_INQUIRY_ROWS[0]
    expect(socialProviders).toBeDefined()
    serve(envelope([withoutProviders]))
    const page = await listAdminInquiries({ page: 0 })
    expect(page.items[0].socialProviders).toEqual([])
  })

  it('status를 안 넘기면 page만 실린다 — BE 기본값이 진행 중이라 대시보드 카드가 그대로 쓴다', async () => {
    const calls = serve(envelope([]))
    await listAdminInquiries({ page: 0, size: 1 })
    expect(calls[0].url).toBe('/api/v1/admin/organization-inquiries?page=0&size=1')
  })
})

describe('기관 도입 문의 상태 전이 (PATCH /admin/organization-inquiries/:id — CHMO-811)', () => {
  it('status만 실어 보내고 갱신된 행을 그대로 돌려받는다(재조회 불필요)', async () => {
    const calls = serve(
      envelope({ ...BE_ADMIN_INQUIRY_ROWS[0], status: 'ONBOARDED', updatedAt: '2026-09-16T09:00:00' }),
    )
    const updated = await updateAdminInquiryStatus(12, 'ONBOARDED')
    expect(calls[0].url).toBe('/api/v1/admin/organization-inquiries/12')
    expect(calls[0].method).toBe('PATCH')
    expect(bodyOf(calls[0])).toEqual({ status: 'ONBOARDED' })
    expect(updated.status).toBe('ONBOARDED')
    expect(updated.updatedAt).toBe('2026-09-16T09:00:00Z')
  })

  it('되돌리기 충돌 INQUIRY409는 OPEN_INQUIRY_EXISTS로 정규화된다', async () => {
    serve(BE_ERRORS.INQUIRY409.payload, BE_ERRORS.INQUIRY409.status)
    const err = await updateAdminInquiryStatus(12, 'RECEIVED').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiRequestError)
    expect((err as ApiRequestError).status).toBe(409)
    expect((err as ApiRequestError).code).toBe('OPEN_INQUIRY_EXISTS')
  })

  it('없는 문의 INQUIRY404는 NOT_FOUND(404)로 온다', async () => {
    serve(BE_ERRORS.INQUIRY404.payload, BE_ERRORS.INQUIRY404.status)
    const err = await updateAdminInquiryStatus(999999, 'CLOSED').catch((e: unknown) => e)
    expect((err as ApiRequestError).status).toBe(404)
    expect((err as ApiRequestError).code).toBe('NOT_FOUND')
  })
})

describe('신고·문의 목록 (GET /admin/reports — CHMO-862)', () => {
  it('status·type·page·size를 조립하고 봉투 pageInfo를 함께 꺼낸다', async () => {
    const calls = stubFetch(() =>
      jsonResponse({
        isSuccess: true,
        code: 'COMMON200',
        message: '성공입니다.',
        pageInfo: BE_ADMIN_PAGE_INFO,
        result: BE_ADMIN_REPORT_ROWS,
      }),
    )

    const page = await listAdminReports({
      page: 0,
      size: 20,
      status: 'RECEIVED,IN_PROGRESS',
      type: 'DELETION_REQUEST,INAPPROPRIATE',
    })
    expect(calls[0].url).toBe(
      '/api/v1/admin/reports?page=0&size=20&status=RECEIVED%2CIN_PROGRESS&type=DELETION_REQUEST%2CINAPPROPRIATE',
    )
    expect(page.pageInfo).toEqual(BE_ADMIN_PAGE_INFO)
    expect(page.items[0]).toEqual({
      id: 2,
      type: 'DELETION_REQUEST',
      status: 'RECEIVED',
      // 사진 신고는 내용 없이 접수된다 — preview도 null
      preview: null,
      userId: 3,
      userNickname: 'test',
      socialProviders: [],
      groupId: 28,
      groupName: '터터',
      photoId: 4901,
      hasAttachments: false,
      // 실측 — 오프셋이 붙어 와서 client.ts가 손대지 않는다(Z를 덧붙이지 않는다)
      createdAt: '2026-09-27T17:20:19.758082+09:00',
      answeredAt: null,
      updatedAt: '2026-09-27T17:20:19.758082+09:00',
    })
  })

  it('모임·사진이 없는 문의 — groupId·groupName·photoId가 null로 온다', async () => {
    serve(envelope(BE_ADMIN_REPORT_ROWS))
    const row = (await listAdminReports({ page: 0 })).items[1]
    expect(row.preview).toBe('스테이징 문의 테스트입니다.')
    expect(row.groupId).toBeNull()
    expect(row.groupName).toBeNull()
    expect(row.photoId).toBeNull()
    expect(row.socialProviders).toEqual([])
  })

  it('null 필드의 키가 생략돼도 같은 값으로 정규화된다', async () => {
    const { groupId, groupName, photoId, socialProviders, answeredAt, ...rest } =
      BE_ADMIN_REPORT_ROWS[1]
    expect(socialProviders).toEqual([])
    expect([groupId, groupName, photoId, answeredAt]).toEqual([null, null, null, null])
    serve(envelope([rest]))
    const row = (await listAdminReports({ page: 0 })).items[0]
    expect(row.groupId).toBeNull()
    expect(row.groupName).toBeNull()
    expect(row.photoId).toBeNull()
    expect(row.socialProviders).toEqual([])
    expect(row.answeredAt).toBeNull()
  })

  it('필터를 안 넘기면 page·size만 실린다 — BE 기본값이 처리 대기라 사이드바 배지가 그대로 쓴다', async () => {
    const calls = serve(envelope([]))
    await listAdminReports({ page: 0, size: 1 })
    expect(calls[0].url).toBe('/api/v1/admin/reports?page=0&size=1')
  })
})

describe('신고·문의 상세 (GET /admin/reports/:id — CHMO-862)', () => {
  it('첨부·사진·역할·기기·이어서 문의·답변을 그대로 건넨다', async () => {
    const calls = serve(envelope(BE_ADMIN_REPORT_DETAIL))
    const detail = await getAdminReport(41)
    expect(calls[0].url).toBe('/api/v1/admin/reports/41')
    expect(detail).toMatchObject({
      id: 41,
      status: 'ANSWERED',
      content: '사진 30장을 올리다가 앱이 꺼졌어요.',
      attachments: [{ url: 'https://cdn.example/reports/128/a.jpg?X-Amz-Signature=1' }],
      photo: {
        id: 91,
        url: 'https://cdn.example/originals/events/17/p.jpg?X-Amz-Signature=2',
        eventId: 17,
        eventName: '운동회',
      },
      photoDeleted: false,
      reporterRole: 'EDITOR',
      client: {
        appVersion: '2.4.0+28',
        platform: 'IOS',
        osVersion: '26.0',
        deviceModel: 'iPhone15,4',
      },
      followUpOf: { id: 33, preview: '이전 문의 내용' },
      reply: {
        content: '확인 후 수정했습니다.',
        answeredAt: '2026-09-28T09:00:00.654321+09:00',
        answeredBy: 3,
      },
    })
  })

  it('사진 신고(실채집) — 원본 URL·이벤트명·신고자 역할·기기 정보가 오고 content는 null', async () => {
    serve(envelope(BE_ADMIN_REPORT_PHOTO_DETAIL))
    const detail = await getAdminReport(2)
    expect(detail.content).toBeNull()
    expect(detail.photo).toEqual({
      id: 4901,
      url: BE_ADMIN_REPORT_PHOTO_DETAIL.photo.url,
      eventId: 72,
      eventName: '확인',
    })
    expect(detail.photoDeleted).toBe(false)
    expect(detail.reporterRole).toBe('EDITOR')
    expect(detail.client).toEqual({
      appVersion: '2.4.0+28',
      platform: 'IOS',
      osVersion: '26.5',
      deviceModel: 'iPhone18,1',
    })
  })

  it('지워진 사진 신고 — photo는 null이고 photoDeleted가 그 사실을 말한다', async () => {
    serve(envelope(BE_ADMIN_REPORT_DETAIL_SPARSE))
    const detail = await getAdminReport(2)
    expect(detail.photoId).toBe(4901) // 식별자는 접수 시점 값을 유지한다(BE 정책)
    expect(detail.photo).toBeNull()
    expect(detail.photoDeleted).toBe(true)
    expect(detail.content).toBeNull()
    expect(detail.attachments).toEqual([])
    expect(detail.reporterRole).toBeNull()
    expect(detail.client).toBeNull()
    expect(detail.followUpOf).toBeNull()
    expect(detail.reply).toBeNull()
  })

  it('없는 신고·문의 REPORT404는 NOT_FOUND(404)로 온다', async () => {
    serve(BE_ERRORS.REPORT404.payload, BE_ERRORS.REPORT404.status)
    const err = await getAdminReport(999999).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiRequestError)
    expect((err as ApiRequestError).status).toBe(404)
    expect((err as ApiRequestError).code).toBe('NOT_FOUND')
  })
})

describe('신고·문의 답변 (POST /admin/reports/:id/reply — CHMO-862)', () => {
  it('content만 실어 보내고 상세 형태를 돌려받는다(패널 재조회 불필요)', async () => {
    const calls = serve(envelope(BE_ADMIN_REPORT_DETAIL))
    const detail = await replyAdminReport(41, '확인 후 수정했습니다.')
    expect(calls[0].url).toBe('/api/v1/admin/reports/41/reply')
    expect(calls[0].method).toBe('POST')
    expect(bodyOf(calls[0])).toEqual({ content: '확인 후 수정했습니다.' })
    expect(detail.status).toBe('ANSWERED')
    expect(detail.reply?.content).toBe('확인 후 수정했습니다.')
  })

  it('길이 위반 VALID400은 status 400 그대로 온다 — 패널이 인라인 문구로 받는다', async () => {
    serve(BE_ERRORS.VALID400.payload, BE_ERRORS.VALID400.status)
    const err = await replyAdminReport(41, 'x').catch((e: unknown) => e)
    expect((err as ApiRequestError).status).toBe(400)
  })
})

describe('신고·문의 상태 전이 (PATCH /admin/reports/:id — CHMO-862)', () => {
  it('status만 실어 보내고 갱신된 행을 돌려받는다', async () => {
    const calls = serve(
      envelope({
        ...BE_ADMIN_REPORT_ROWS[0],
        status: 'IN_PROGRESS',
        updatedAt: '2026-09-27T18:00:00.000001+09:00',
      }),
    )
    const row = await updateAdminReportStatus(2, 'IN_PROGRESS')
    expect(calls[0].url).toBe('/api/v1/admin/reports/2')
    expect(calls[0].method).toBe('PATCH')
    expect(bodyOf(calls[0])).toEqual({ status: 'IN_PROGRESS' })
    expect(row.status).toBe('IN_PROGRESS')
    expect(row.updatedAt).toBe('2026-09-27T18:00:00.000001+09:00')
  })

  it('없는 신고·문의 REPORT404는 NOT_FOUND(404)로 온다', async () => {
    serve(BE_ERRORS.REPORT404.payload, BE_ERRORS.REPORT404.status)
    const err = await updateAdminReportStatus(999999, 'CLOSED').catch((e: unknown) => e)
    expect((err as ApiRequestError).status).toBe(404)
    expect((err as ApiRequestError).code).toBe('NOT_FOUND')
  })
})

// ── 이벤트 팝업 (CHMO-928 — BE CHMO-926) ─────────────────────────────

const POPUP_INPUT: AdminPopupInput = {
  title: '10월 설문',
  imageKey: BE_ADMIN_POPUP.imageKey,
  imageAlt: '치즈모아 사용 설문',
  ctaLabel: '설문 참여하기',
  linkUrl: 'https://forms.gle/survey',
  linkTarget: 'IN_APP',
  audience: 'ALL',
  locale: 'ko',
  startsAt: '2026-10-15T08:00:00+09:00',
  endsAt: '2026-10-31T23:59:00+09:00',
  priority: 0,
  hideOption: 'TODAY',
  active: true,
  minAppVersion: '2.7.0',
}

describe('팝업 목록 (GET /admin/popups — CHMO-928)', () => {
  it('status·page·size를 조립하고 봉투 pageInfo를 함께 꺼낸다', async () => {
    const calls = serve({ ...envelope([BE_ADMIN_POPUP]), pageInfo: BE_ADMIN_PAGE_INFO })
    const { items, pageInfo } = await listAdminPopups({ page: 0, size: 20, status: 'LIVE' })
    expect(calls[0].url).toBe('/api/v1/admin/popups?page=0&size=20&status=LIVE')
    expect(pageInfo).toEqual(BE_ADMIN_PAGE_INFO)
    expect(items[0]).toMatchObject({
      popupId: 12,
      ctaLabel: '설문 참여하기',
      minAppVersion: '2.7.0',
      status: 'SCHEDULED',
      // Instant는 이미 Z, BaseEntity 감사 시각(LocalDateTime)에만 Z가 붙는다
      startsAt: '2026-10-14T23:00:00Z',
      createdAt: '2026-10-14T10:00:00Z',
    })
  })

  it('선택 필드가 키째 빠지면(NON_NULL) null로 접는다 — 앱이 빈 버튼을 안 세우는 것과 같은 판정', async () => {
    serve({ ...envelope([BE_ADMIN_POPUP_SPARSE]), pageInfo: BE_ADMIN_PAGE_INFO })
    const { items } = await listAdminPopups({ page: 0 })
    expect(items[0].ctaLabel).toBeNull()
    expect(items[0].minAppVersion).toBeNull()
    expect(items[0].status).toBe('OFF')
  })

  it('status를 안 넘기면 page만 실린다 — 전체(삭제분 제외)가 BE 기본값', async () => {
    const calls = serve({ ...envelope([]), pageInfo: BE_ADMIN_PAGE_INFO })
    await listAdminPopups({ page: 1 })
    expect(calls[0].url).toBe('/api/v1/admin/popups?page=1')
  })
})

describe('팝업 쓰기 (POST·PUT·PATCH·DELETE /admin/popups — CHMO-928)', () => {
  it('생성은 전체 필드를 평면으로 보내고 행 형태를 돌려받는다', async () => {
    const calls = serve(envelope(BE_ADMIN_POPUP, 'COMMON201'), 201)
    const created = await createAdminPopup(POPUP_INPUT)
    expect(calls[0].url).toBe('/api/v1/admin/popups')
    expect(calls[0].method).toBe('POST')
    expect(bodyOf(calls[0])).toEqual(POPUP_INPUT)
    expect(created.popupId).toBe(12)
  })

  it('빈 선택 필드는 빈 문자열이 아니라 null로 보낸다 — 빈 ctaLabel이 앱에 빈 옐로 필을 세운다', async () => {
    const calls = serve(envelope(BE_ADMIN_POPUP))
    await updateAdminPopup(12, { ...POPUP_INPUT, ctaLabel: '  ', minAppVersion: '' })
    expect(calls[0].url).toBe('/api/v1/admin/popups/12')
    expect(calls[0].method).toBe('PUT')
    expect(bodyOf(calls[0])).toMatchObject({ ctaLabel: null, minAppVersion: null })
  })

  it('켜기/끄기는 active만 싣고 갱신된 행(새 상태 파생값)을 돌려받는다', async () => {
    const calls = serve(envelope({ ...BE_ADMIN_POPUP, active: false, status: 'OFF' }))
    const updated = await setAdminPopupActive(12, false)
    expect(calls[0].url).toBe('/api/v1/admin/popups/12/active')
    expect(calls[0].method).toBe('PATCH')
    expect(bodyOf(calls[0])).toEqual({ active: false })
    expect(updated.status).toBe('OFF')
  })

  it('삭제는 result 없는 성공 응답이다', async () => {
    const calls = serve({ isSuccess: true, code: 'COMMON200', message: '성공입니다.' })
    await expect(deleteAdminPopup(12)).resolves.toBeUndefined()
    expect(calls[0].url).toBe('/api/v1/admin/popups/12')
    expect(calls[0].method).toBe('DELETE')
  })

  it('정책 위반 POPUP400은 INVALID_POPUP으로 정규화된다', async () => {
    serve(BE_ERRORS.POPUP400.payload, BE_ERRORS.POPUP400.status)
    const err = await createAdminPopup(POPUP_INPUT).catch((e: unknown) => e)
    expect((err as ApiRequestError).status).toBe(400)
    expect((err as ApiRequestError).code).toBe('INVALID_POPUP')
  })
})

describe('팝업 이미지 업로드 (presign → S3 PUT — CHMO-928)', () => {
  it('presign에 파일의 type·size를 그대로 싣는다 — 둘 다 PUT 서명에 들어간다', async () => {
    const calls = serve(envelope(BE_ADMIN_POPUP_IMAGE))
    const upload = await presignAdminPopupImage({ type: 'image/jpeg', size: 123456 })
    expect(calls[0].url).toBe('/api/v1/admin/popups/images/presign')
    expect(bodyOf(calls[0])).toEqual({ contentType: 'image/jpeg', size: 123456 })
    expect(upload.key).toBe(BE_ADMIN_POPUP_IMAGE.key)
  })

  it('S3 PUT은 presign URL로 직접 — 인증 헤더 없이 파일의 Content-Type을 싣는다', async () => {
    const calls = stubFetch(() => new Response(null, { status: 200 }))
    const file = new Blob(['x'], { type: 'image/png' })
    await putAdminPopupImage(BE_ADMIN_POPUP_IMAGE.uploadUrl, file)
    expect(calls[0].url).toBe(BE_ADMIN_POPUP_IMAGE.uploadUrl)
    expect(calls[0].method).toBe('PUT')
    expect(calls[0].headers.get('Content-Type')).toBe('image/png')
    expect(calls[0].headers.get('Authorization')).toBeNull()
  })

  it('S3가 거절하면(서명 불일치 403 등) 던진다', async () => {
    stubFetch(() => new Response(null, { status: 403 }))
    await expect(
      putAdminPopupImage(BE_ADMIN_POPUP_IMAGE.uploadUrl, new Blob(['x'], { type: 'image/png' })),
    ).rejects.toThrow()
  })
})

// ── 혜택 푸시 (CHMO-928 — BE CHMO-926 B절) ──────────────────────────

const CAMPAIGN_INPUT = { title: '설문 참여 혜택', body: '의견을 들려주세요.', link: null }

describe('혜택 푸시 발송 (POST /admin/push-campaigns — CHMO-928)', () => {
  it('Idempotency-Key 헤더와 함께 보내고, 빈 link·즉시 발송의 scheduledAt은 키째 뺀다', async () => {
    const calls = serve(envelope({ ...BE_ADMIN_CAMPAIGN_SCHEDULED, status: 'QUEUED' }, 'COMMON202'), 202)
    const created = await createAdminCampaign(CAMPAIGN_INPUT, null, 'key-1')
    expect(calls[0].url).toBe('/api/v1/admin/push-campaigns')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].headers.get('Idempotency-Key')).toBe('key-1')
    // 모르는 필드는 BE가 400으로 거부한다 — null 키도 싣지 않는다
    expect(bodyOf(calls[0])).toEqual({ title: '설문 참여 혜택', body: '의견을 들려주세요.' })
    expect(created.status).toBe('QUEUED')
  })

  it('예약은 scheduledAt을 싣고, 응답 title·body는 서버가 붙인 최종본이다', async () => {
    const calls = serve(envelope(BE_ADMIN_CAMPAIGN_SCHEDULED, 'COMMON202'), 202)
    const created = await createAdminCampaign(
      { ...CAMPAIGN_INPUT, link: ' https://forms.gle/survey ' },
      '2026-10-15T10:00:00+09:00',
      'key-2',
    )
    expect(bodyOf(calls[0])).toEqual({
      title: '설문 참여 혜택',
      body: '의견을 들려주세요.',
      link: 'https://forms.gle/survey',
      scheduledAt: '2026-10-15T10:00:00+09:00',
    })
    expect(created).toMatchObject({
      status: 'SCHEDULED',
      title: '(광고) 설문 참여 혜택',
      scheduledAt: '2026-10-15T01:00:00Z',
      createdAt: '2026-10-14T10:20:00Z',
      // NON_NULL로 빠진 키는 null로 접힌다
      sentAt: null,
      testUserId: null,
      failureCode: null,
      fcmMessageIds: [],
    })
  })

  it('테스트 발송은 userId를 싣고 scheduledAt은 절대 싣지 않는다(테스트 DTO에 없는 필드 = 400)', async () => {
    const calls = serve(envelope(BE_ADMIN_CAMPAIGN_TEST_SENT, 'COMMON202'), 202)
    const sent = await testAdminCampaign(CAMPAIGN_INPUT, 3, 'key-3')
    expect(calls[0].url).toBe('/api/v1/admin/push-campaigns/test')
    expect(calls[0].headers.get('Idempotency-Key')).toBe('key-3')
    expect(bodyOf(calls[0])).toEqual({
      title: '설문 참여 혜택',
      body: '의견을 들려주세요.',
      userId: 3,
    })
    expect(sent).toMatchObject({ testUserId: 3, link: null, scheduledAt: null })
    expect(sent.fcmMessageIds).toHaveLength(1)
  })

  it('야간·수신 조건 위반 CAMPAIGN400은 INVALID_CAMPAIGN으로 정규화된다', async () => {
    serve(BE_ERRORS.CAMPAIGN400.payload, BE_ERRORS.CAMPAIGN400.status)
    const err = await createAdminCampaign(CAMPAIGN_INPUT, null, 'key-4').catch((e: unknown) => e)
    expect((err as ApiRequestError).status).toBe(400)
    expect((err as ApiRequestError).code).toBe('INVALID_CAMPAIGN')
  })
})

describe('혜택 푸시 이력·대상 수·취소 (CHMO-928)', () => {
  it('이력은 page·size를 조립하고 결과 불명 행의 실패 코드를 건넨다', async () => {
    const calls = serve({
      ...envelope([BE_ADMIN_CAMPAIGN_UNKNOWN, BE_ADMIN_CAMPAIGN_TEST_SENT]),
      pageInfo: BE_ADMIN_PAGE_INFO,
    })
    const { items, pageInfo } = await listAdminCampaigns({ page: 0, size: 20 })
    expect(calls[0].url).toBe('/api/v1/admin/push-campaigns?page=0&size=20')
    expect(pageInfo).toEqual(BE_ADMIN_PAGE_INFO)
    expect(items[0]).toMatchObject({ status: 'UNKNOWN', failureCode: 'FCM_RESULT_UNKNOWN' })
    expect(items[1].sentAt).toBe('2026-10-14T01:21:05Z')
  })

  it('대상 수는 사용자·기기 두 값이다', async () => {
    const calls = serve(envelope(BE_ADMIN_CAMPAIGN_RECIPIENTS))
    await expect(getAdminCampaignRecipients()).resolves.toEqual({
      userCount: 100,
      deviceCount: 140,
    })
    expect(calls[0].url).toBe('/api/v1/admin/push-campaigns/recipients')
  })

  it('예약 취소는 본문 없이 POST하고, 이미 집힌 예약 CAMPAIGN409는 CAMPAIGN_CONFLICT로 온다', async () => {
    const calls = serve(envelope({ ...BE_ADMIN_CAMPAIGN_SCHEDULED, status: 'CANCELLED', cancelledBy: 3 }))
    const cancelled = await cancelAdminCampaign(42)
    expect(calls[0].url).toBe('/api/v1/admin/push-campaigns/42/cancel')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].body).toBeNull()
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelledBy: 3 })

    serve(BE_ERRORS.CAMPAIGN409.payload, BE_ERRORS.CAMPAIGN409.status)
    const err = await cancelAdminCampaign(42).catch((e: unknown) => e)
    expect((err as ApiRequestError).status).toBe(409)
    expect((err as ApiRequestError).code).toBe('CAMPAIGN_CONFLICT')
  })
})

// ── 사용자 장수·기관 구독 (CHMO-931 — BE CHMO-912) ─────────────────

const PERIOD_INPUT = {
  accessFrom: '2026-10-01T00:00:00+09:00',
  accessUntil: '2026-11-01T00:00:00+09:00',
  amountKrw: 100000,
  paidOn: '2026-09-30',
  payerName: '치즈유치원',
  invoiceNo: 'INV-2026-001',
  memo: '10월 이용료',
}

describe('사용자 검색·장수 (CHMO-931)', () => {
  it('검색은 query·cursor·size를 조립하고 커서 페이지로 접는다', async () => {
    const calls = serve(envelope(BE_ADMIN_USER_SEARCH))
    const page = await searchAdminUsers({ query: '치즈', cursor: 10, size: 20 })
    expect(calls[0].url).toBe('/api/v1/admin/users?query=%EC%B9%98%EC%A6%88&cursor=10&size=20')
    expect(page.items[0]).toEqual({ userId: 7, nickname: '치즈', accountType: 'ORGANIZATION' })
    expect(page.nextCursor).toBe(3)
    expect(page.hasNext).toBe(true)
  })

  it('빈 검색어도 query=를 싣는다(BE 기본값 ""와 같다) · 커서 없으면 cursor를 안 싣는다', async () => {
    const calls = serve(envelope({ items: [], nextCursor: null, hasNext: false }))
    const page = await searchAdminUsers({ query: '' })
    expect(calls[0].url).toBe('/api/v1/admin/users?query=')
    expect(page).toEqual({ items: [], nextCursor: null, hasNext: false })
  })

  it('장수 조회는 잔액·장부를 주고 모임/이벤트 null·LocalDateTime 보정을 정규화한다', async () => {
    const calls = serve(envelope(BE_ADMIN_USER_CREDITS))
    const credits = await getAdminUserCredits(3, { cursor: 103, size: 20 })
    expect(calls[0].url).toBe('/api/v1/admin/users/3/credits?cursor=103&size=20')
    expect(credits.balance).toBe(88)
    expect(credits.ledger.items[0]).toMatchObject({
      reason: 'UPLOAD',
      groupName: '가족 여행',
      eventName: '제주 2일차',
      memo: null,
      createdAt: '2026-10-07T09:30:00Z', // 오프셋 없는 BE 시각 → 'Z' 보정
    })
    expect(credits.ledger.items[1]).toMatchObject({ groupId: null, groupName: null, memo: '고객 지원 보상' })
    expect(credits.ledger.nextCursor).toBe(101)
  })

  it('장수 조회는 파라미터가 없으면 쿼리 문자열 자체를 안 붙인다', async () => {
    const calls = serve(envelope(BE_ADMIN_USER_CREDITS))
    await getAdminUserCredits(3)
    expect(calls[0].url).toBe('/api/v1/admin/users/3/credits')
  })

  it('장수 기능 미설정 BILLING503은 BILLING_UNAVAILABLE로, 없는 사용자 USER404는 404로 온다', async () => {
    serve(BE_ERRORS.BILLING503.payload, BE_ERRORS.BILLING503.status)
    const disabled = await getAdminUserCredits(3).catch((e: unknown) => e)
    expect((disabled as ApiRequestError).code).toBe('BILLING_UNAVAILABLE')

    serve(BE_ERRORS.USER404.payload, BE_ERRORS.USER404.status)
    const gone = await getAdminUserCredits(999).catch((e: unknown) => e)
    expect((gone as ApiRequestError).status).toBe(404)
    expect((gone as ApiRequestError).code).toBe('NOT_FOUND')
  })

  it('장수 조정은 delta·memo를 POST하고 201 응답의 잔액을 돌려준다', async () => {
    const calls = serve(envelope(BE_ADMIN_CREDIT_ADJUSTMENT, 'COMMON201'), 201)
    const result = await adjustAdminUserCredits(3, { delta: 100, memo: '고객 지원 보상' })
    expect(calls[0].url).toBe('/api/v1/admin/users/3/credit-adjustments')
    expect(calls[0].method).toBe('POST')
    expect(bodyOf(calls[0])).toEqual({ delta: 100, memo: '고객 지원 보상' })
    expect(result).toEqual({ userId: 3, delta: 100, balance: 188 })
  })

  it('잔액을 넘는 회수 CREDIT409는 CREDIT_INSUFFICIENT로 정규화된다', async () => {
    serve(BE_ERRORS.CREDIT409.payload, BE_ERRORS.CREDIT409.status)
    const err = await adjustAdminUserCredits(3, { delta: -500, memo: '오지급' }).catch((e: unknown) => e)
    expect((err as ApiRequestError).status).toBe(409)
    expect((err as ApiRequestError).code).toBe('CREDIT_INSUFFICIENT')
    expect((err as ApiRequestError).message).toBe('무료 사진 장수가 부족합니다.')
  })
})

describe('기관 구독 (CHMO-931)', () => {
  it('구독 목록은 커서 페이지이고 지워진 계정의 nickname·기간 없는 accessUntil을 null로 둔다', async () => {
    const calls = serve(envelope(BE_ADMIN_SUBSCRIPTION_ROWS))
    const page = await listAdminOrganizationSubscriptions({ size: 20 })
    expect(calls[0].url).toBe('/api/v1/admin/organizations/subscriptions?size=20')
    expect(page.items[0]).toMatchObject({ userId: 7, nickname: '치즈', status: 'ACTIVE' })
    expect(page.items[1]).toEqual({
      subscriptionId: 1,
      userId: 8,
      nickname: null,
      status: 'BLOCKED',
      accessUntil: null,
      graceEndsAt: null,
    })
    expect(page.hasNext).toBe(false)
  })

  it('기간 등록은 요청 필드를 그대로 POST하고 201 응답의 접근 상태·기간을 돌려준다', async () => {
    const calls = serve(envelope(BE_ADMIN_SUBSCRIPTION, 'COMMON201'), 201)
    const result = await registerAdminSubscriptionPeriod(7, PERIOD_INPUT)
    expect(calls[0].url).toBe('/api/v1/admin/organizations/7/subscription-periods')
    expect(calls[0].method).toBe('POST')
    expect(bodyOf(calls[0])).toEqual(PERIOD_INPUT)
    expect(result).toMatchObject({
      organizationUserId: 7,
      accessStatus: 'ACTIVE',
      accessUntil: '2026-11-01T00:00:00Z',
      period: { periodId: 5, amountKrw: 100000, invoiceNo: 'INV-2026-001', voidedAt: null },
    })
  })

  it('선택 칸이 비면 null로 보낸다 · 기관 계정이 아니면 VALID400 메시지가 그대로 온다', async () => {
    const calls = serve(envelope(BE_ADMIN_SUBSCRIPTION, 'COMMON201'), 201)
    await registerAdminSubscriptionPeriod(7, { ...PERIOD_INPUT, invoiceNo: null, memo: null })
    expect(bodyOf(calls[0])).toMatchObject({ invoiceNo: null, memo: null })

    serve(
      { isSuccess: false, code: 'VALID400', message: '기관 계정만 구독 기간을 등록할 수 있습니다.' },
      400,
    )
    const err = await registerAdminSubscriptionPeriod(3, PERIOD_INPUT).catch((e: unknown) => e)
    expect((err as ApiRequestError).status).toBe(400)
    expect((err as ApiRequestError).message).toBe('기관 계정만 구독 기간을 등록할 수 있습니다.')
  })

  it('무효화는 본문 없이 DELETE하고 voidedAt이 찬 기간과 바뀐 접근 상태를 돌려준다', async () => {
    const calls = serve(
      envelope({
        ...BE_ADMIN_SUBSCRIPTION,
        nickname: null,
        accessStatus: 'BLOCKED',
        accessUntil: null,
        graceEndsAt: null,
        period: { ...BE_ADMIN_SUBSCRIPTION.period, voidedAt: '2026-10-15T06:00:00Z' },
      }),
    )
    const result = await voidAdminSubscriptionPeriod(5)
    expect(calls[0].url).toBe('/api/v1/admin/organization-subscription-periods/5')
    expect(calls[0].method).toBe('DELETE')
    expect(calls[0].body).toBeNull()
    expect(result.nickname).toBeNull()
    expect(result.accessStatus).toBe('BLOCKED')
    expect(result.period.voidedAt).toBe('2026-10-15T06:00:00Z')
  })

  it('기관 문의 개통은 subscriptionPeriod를 함께 싣고, 없으면 종전처럼 status만 보낸다', async () => {
    const calls = serve(envelope({ ...BE_ADMIN_INQUIRY_ROWS[0], status: 'ONBOARDED' }))
    await updateAdminInquiryStatus(12, 'ONBOARDED', PERIOD_INPUT)
    expect(bodyOf(calls[0])).toEqual({ status: 'ONBOARDED', subscriptionPeriod: PERIOD_INPUT })

    const plain = serve(envelope({ ...BE_ADMIN_INQUIRY_ROWS[0], status: 'ONBOARDED' }))
    await updateAdminInquiryStatus(12, 'ONBOARDED', null)
    expect(bodyOf(plain[0])).toEqual({ status: 'ONBOARDED' })
  })
})

describe('어드민 조회 확장·패스 지급·과금 범위 (CHMO-932 — BE PR #317)', () => {
  it('사용자 요약은 소셜·속한 모임(승인 대기 포함)을 그대로 건네고 없는 사용자는 USER404', async () => {
    const calls = serve(envelope(BE_ADMIN_USER_SUMMARY))
    const summary = await getAdminUserSummary(3)
    expect(calls[0].url).toBe('/api/v1/admin/users/3')
    expect(summary).toEqual({
      userId: 3,
      nickname: '김선생',
      accountType: 'PERSONAL',
      role: 'USER',
      createdAt: '2026-08-01T10:00:00Z',
      socialProviders: ['KAKAO'],
      groups: [
        { groupId: 45, groupType: 'BUSINESS', role: 'EDITOR', status: 'ACTIVE' },
        { groupId: 40, groupType: 'GENERAL', role: 'EDITOR', status: 'PENDING' },
      ],
    })
    // 모임 이름은 어디에도 없다(CHMO-668) — `nickname`은 모임 이름이 아니다
    expect(JSON.stringify(summary)).not.toContain('"name"')

    serve(BE_ERRORS.USER404.payload, BE_ERRORS.USER404.status)
    const gone = await getAdminUserSummary(999).catch((e: unknown) => e)
    expect((gone as ApiRequestError).status).toBe(404)
    expect((gone as ApiRequestError).code).toBe('NOT_FOUND')
  })

  it('기관 구독 이력 — kind·adminId null(가입 체험)·무효화분이 최신순 그대로 오고, kind가 빠지면 adminId로 파생한다', async () => {
    const calls = serve(envelope(BE_ADMIN_SUBSCRIPTION_HISTORY))
    const history = await getAdminOrganizationSubscriptionHistory(52)
    expect(calls[0].url).toBe('/api/v1/admin/organizations/52/subscription')
    expect(history).toMatchObject({ userId: 52, accountType: 'ORGANIZATION', accessStatus: 'ACTIVE' })
    expect(history.periods[0]).toMatchObject({ periodId: 9, kind: 'TRIAL', adminId: null, amountKrw: 0, voidedAt: null })
    expect(history.periods[1]).toMatchObject({
      periodId: 4,
      kind: 'ADMIN',
      adminId: 17,
      voidedAt: '2026-08-31T01:00:00Z',
      voidedBy: 17,
      createdAt: '2026-08-30T09:00:00Z', // BaseEntity — Z 보정
    })

    // kind 키가 빠져도 BE와 같은 규칙으로 파생(등록 관리자 없음 = 체험) · 구독 행 없는 기관은 빈 이력 + BLOCKED
    const [trial, admin] = BE_ADMIN_SUBSCRIPTION_HISTORY.periods.map(({ kind: _kind, ...rest }) => rest)
    serve(envelope({ ...BE_ADMIN_SUBSCRIPTION_HISTORY, accessStatus: 'BLOCKED', accessUntil: null, graceEndsAt: null, periods: [trial, admin] }))
    const derived = await getAdminOrganizationSubscriptionHistory(52)
    expect(derived.periods.map((p) => p.kind)).toEqual(['TRIAL', 'ADMIN'])
    serve(envelope({ ...BE_ADMIN_SUBSCRIPTION_HISTORY, accessStatus: 'BLOCKED', accessUntil: null, graceEndsAt: null, periods: [] }))
    const blocked = await getAdminOrganizationSubscriptionHistory(52)
    expect(blocked).toMatchObject({ accessStatus: 'BLOCKED', accessUntil: null, periods: [] })
  })

  it('패스 지급은 plan·memo와 Idempotency-Key를 싣고 201 응답을 돌려준다 · 기관 범위 VALID400 메시지는 그대로', async () => {
    const calls = serve(envelope(BE_ADMIN_PASS_GRANT, 'COMMON201'), 201)
    const result = await grantAdminGroupPass(45, { plan: 'DAY_7', memo: '설문 참여 보상' }, 'b3f1e2c4-0000-4000-8000-000000000001')
    expect(calls[0].url).toBe('/api/v1/admin/groups/45/pass-grants')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].headers.get('Idempotency-Key')).toBe('b3f1e2c4-0000-4000-8000-000000000001')
    expect(bodyOf(calls[0])).toEqual({ plan: 'DAY_7', memo: '설문 참여 보상' })
    expect(result).toEqual({
      grantId: 7,
      groupId: 45,
      plan: 'DAY_7',
      accessFrom: '2026-10-16T03:00:00Z',
      accessUntil: '2026-10-23T03:00:00Z',
    })

    serve({ isSuccess: false, code: 'VALID400', message: '기관 범위 모임은 이용 기간으로 등록합니다.' }, 400)
    const err = await grantAdminGroupPass(46, { plan: 'DAY_1', memo: '체험' }).catch((e: unknown) => e)
    expect((err as ApiRequestError).status).toBe(400)
    expect((err as ApiRequestError).message).toBe('기관 범위 모임은 이용 기간으로 등록합니다.')

    serve(BE_ERRORS.SPACE404.payload, BE_ERRORS.SPACE404.status)
    const gone = await grantAdminGroupPass(999, { plan: 'DAY_1', memo: '체험' }).catch((e: unknown) => e)
    expect((gone as ApiRequestError).code).toBe('NOT_FOUND')
  })

  it('패스 회수는 본문 없이 DELETE하고 회수 뒤 만료를 돌려준다 · 없는 지급 BILLING404는 404', async () => {
    const calls = serve(envelope(BE_ADMIN_PASS_GRANT_REVOKE))
    const result = await revokeAdminPassGrant(7)
    expect(calls[0].url).toBe('/api/v1/admin/pass-grants/7')
    expect(calls[0].method).toBe('DELETE')
    expect(calls[0].body).toBeNull()
    expect(result).toEqual({
      grantId: 7,
      groupId: 45,
      revokedAt: '2026-10-17T01:00:00Z',
      passAccessUntil: '2026-10-17T01:00:00Z',
    })
    // 패스 행이 없으면 passAccessUntil null(키 생략도 같은 값)
    serve(envelope({ grantId: 8, groupId: 45, revokedAt: '2026-10-17T01:00:00Z' }))
    expect((await revokeAdminPassGrant(8)).passAccessUntil).toBeNull()

    serve({ isSuccess: false, code: 'BILLING404', message: '결제수단 또는 구독을 찾을 수 없습니다.' }, 404)
    const gone = await revokeAdminPassGrant(999).catch((e: unknown) => e)
    expect((gone as ApiRequestError).status).toBe(404)
    expect((gone as ApiRequestError).code).toBe('NOT_FOUND')
  })

  it('과금 범위 변경은 PUT으로 범위·소유자·메모를 싣고 바뀐 값을 돌려준다 · 기관 계정 아님 VALID400·없는 소유자 USER404', async () => {
    const calls = serve(envelope(BE_ADMIN_BILLING_SCOPE))
    const input = { billingScope: 'INSTITUTION' as const, billingOwnerUserId: 52, memo: '유치원 계약 전환' }
    const result = await changeAdminGroupBillingScope(45, input)
    expect(calls[0].url).toBe('/api/v1/admin/groups/45/billing-scope')
    expect(calls[0].method).toBe('PUT')
    expect(bodyOf(calls[0])).toEqual(input)
    expect(result).toEqual({ groupId: 45, billingScope: 'INSTITUTION', billingOwnerUserId: 52 })

    serve({ isSuccess: false, code: 'VALID400', message: '기관 과금 범위의 소유자는 기관 계정이어야 합니다.' }, 400)
    const invalid = await changeAdminGroupBillingScope(45, { ...input, billingOwnerUserId: 3 }).catch((e: unknown) => e)
    expect((invalid as ApiRequestError).message).toBe('기관 과금 범위의 소유자는 기관 계정이어야 합니다.')

    serve(BE_ERRORS.USER404.payload, BE_ERRORS.USER404.status)
    const gone = await changeAdminGroupBillingScope(45, { ...input, billingOwnerUserId: 999 }).catch((e: unknown) => e)
    expect((gone as ApiRequestError).status).toBe(404)
  })

  it('장수 조정·기간 등록도 Idempotency-Key를 싣고(없으면 헤더 자체가 없다) 같은 키 다른 내용 ADMIN409는 ADMIN_REQUEST_CONFLICT', async () => {
    const key = 'b3f1e2c4-0000-4000-8000-000000000002'
    const credit = serve(envelope(BE_ADMIN_CREDIT_ADJUSTMENT, 'COMMON201'), 201)
    await adjustAdminUserCredits(3, { delta: 100, memo: '보상' }, key)
    expect(credit[0].headers.get('Idempotency-Key')).toBe(key)

    const period = serve(envelope(BE_ADMIN_SUBSCRIPTION, 'COMMON201'), 201)
    await registerAdminSubscriptionPeriod(7, PERIOD_INPUT, key)
    expect(period[0].headers.get('Idempotency-Key')).toBe(key)

    // 키를 안 주면 종전 계약 그대로(서버가 매번 실행) — 헤더를 빈 값으로도 싣지 않는다
    const plain = serve(envelope(BE_ADMIN_CREDIT_ADJUSTMENT, 'COMMON201'), 201)
    await adjustAdminUserCredits(3, { delta: 100, memo: '보상' })
    expect(plain[0].headers.has('Idempotency-Key')).toBe(false)

    serve(BE_ERRORS.ADMIN409.payload, BE_ERRORS.ADMIN409.status)
    const conflict = await adjustAdminUserCredits(3, { delta: 200, memo: '보상' }, key).catch((e: unknown) => e)
    expect((conflict as ApiRequestError).status).toBe(409)
    expect((conflict as ApiRequestError).code).toBe('ADMIN_REQUEST_CONFLICT')
  })
})
