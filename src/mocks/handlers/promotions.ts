/**
 * 이벤트 팝업·혜택 푸시 어드민 목 (CHMO-928 — BE CHMO-926 PR #312 develop 머지분).
 *
 * 검증 **순서**까지 BE를 따른다: 관리자 가드(COMMON401 → ADMIN403) → 바인딩·Bean Validation
 * (VALID400·COMMON400) → 유스케이스 정책(POPUP400·CAMPAIGN400) → 대상 조회(POPUP404·CAMPAIGN404).
 * 그래서 없는 팝업에 형식이 틀린 본문을 보내면 404가 아니라 400이 먼저 온다(BE와 같다).
 *
 * 규칙(https·버전·야간·자동 문구·크기)은 화면과 같은 단일 원천(admin/lib/promotion)을 쓴다 —
 * 화면이 먼저 막는 판정과 목이 거부하는 판정이 어긋나지 않게.
 *
 * 실 BE의 5초 주기 디스패처 대신 **조회할 때마다 정산**한다(settleCampaigns). 즉시 발송은 3초 뒤
 * 만기로 접수해 '대기 중'이 이력에 잠깐 보이고, 화면의 짧은 재조회가 '보냄'으로 바꾸는 것까지 탄다.
 */
import { http, HttpResponse } from 'msw'
import {
  CAMPAIGN_LIMITS,
  POPUP_IMAGE_MAX_BYTES,
  POPUP_LIMITS,
  adBody,
  adTitle,
  campaignPayloadBytes,
  isCampaignDaytime,
  isHttpsLink,
  isValidAppVersion,
  nextCampaignDaytime,
} from '../../admin/lib/promotion'
import {
  campaignDevicesOf,
  campaignRecipientCounts,
  db,
  isObjectUploaded,
  markObjectUploaded,
  nextId,
  nowIso,
  storePopupImage,
  type DbPopup,
  type DbPushCampaign,
} from '../db'
import { adminGate, intParam } from './admin'
import {
  accepted,
  commonBadRequest,
  created,
  errorResponse,
  invalidBody,
  invalidRequest,
  ok,
  okPaged,
  readJson,
  toId,
  api,
} from './shared'
import { toAdminCampaignResponse, toAdminPopupResponse } from './serializers'

// ── 공통 ─────────────────────────────────────────────────────────────

function invalidPopup() {
  return errorResponse(400, 'POPUP400', '팝업 설정이 올바르지 않습니다.')
}

function popupNotFound() {
  return errorResponse(404, 'POPUP404', '팝업을 찾을 수 없습니다.')
}

function invalidCampaign() {
  return errorResponse(400, 'CAMPAIGN400', '발송 시각 또는 수신 조건이 올바르지 않습니다.')
}

function campaignConflict() {
  return errorResponse(409, 'CAMPAIGN409', '이미 처리된 요청이거나 취소할 수 없는 발송입니다.')
}

/** 페이지 범위 — 두 목록 모두 BE 유스케이스가 VALIDATION_ERROR(VALID400)로 거른다 */
function pageParams(url: URL): { page: number; size: number } | Response {
  const page = intParam(url, 'page', 0)
  const size = intParam(url, 'size', 20)
  // 숫자가 아니면 바인딩 실패(COMMON400), 범위 밖이면 유스케이스 검증(VALID400)
  if (page === null || size === null) return commonBadRequest()
  if (page < 0 || size < 1 || size > 100) return invalidRequest('잘못된 페이지 요청입니다.')
  return { page, size }
}

function paged<T>(rows: T[], page: number, size: number) {
  const totalElements = rows.length
  const totalPages = Math.ceil(totalElements / size)
  return okPaged(rows.slice(page * size, page * size + size), {
    page,
    size,
    hasNext: page + 1 < totalPages,
    totalElements,
    totalPages,
  })
}

/** ISO-8601 + 오프셋만 받는다(BE Instant 바인딩) — 오프셋 없는 값·형식 오류는 null */
function instantOf(value: unknown): number | null {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

// ── 이벤트 팝업 ──────────────────────────────────────────────────────

const POPUP_STATUSES = ['OFF', 'SCHEDULED', 'LIVE', 'ENDED'] as const
const LINK_TARGETS = ['IN_APP', 'EXTERNAL'] as const
const AUDIENCES = ['ALL', 'ORGANIZATION', 'PERSONAL'] as const
const HIDE_OPTIONS = ['TODAY', 'NONE'] as const
const LOCALES = ['ko', 'en', 'ja'] as const

/** BE S3PopupImages.validate — 서버 발급 형식의 키만(+ 실제로 PUT된 것만) */
const POPUP_IMAGE_KEY_RE =
  /^popups\/[0-9]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/

type PopupContent = Omit<
  DbPopup,
  'id' | 'createdBy' | 'updatedBy' | 'deletedAt' | 'createdAt' | 'updatedAt'
>

function oneOf<T extends string>(values: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function nonBlank(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() !== '' && value.length <= max ? value : null
}

/**
 * PopupRequest 바인딩 + Bean Validation(VALID400) → 정책 검증(POPUP400) 순서.
 * 정책은 BE `CreatePopupUseCase.validate` + `S3PopupImages.validate`와 같다.
 */
function readPopupContent(body: Record<string, unknown>): PopupContent | Response {
  const title = nonBlank(body.title, POPUP_LIMITS.title)
  const imageKey = nonBlank(body.imageKey, 512)
  const imageAlt = nonBlank(body.imageAlt, POPUP_LIMITS.imageAlt)
  const linkUrl = nonBlank(body.linkUrl, POPUP_LIMITS.linkUrl)
  const ctaLabel = body.ctaLabel ?? null
  const minAppVersion = body.minAppVersion ?? null
  const linkTarget = oneOf(LINK_TARGETS, body.linkTarget)
  const audience = oneOf(AUDIENCES, body.audience)
  const hideOption = oneOf(HIDE_OPTIONS, body.hideOption)
  const locale = oneOf(LOCALES, body.locale)
  const startsAt = instantOf(body.startsAt)
  const endsAt = instantOf(body.endsAt)
  const priority = body.priority
  const active = body.active

  if (!title || !imageKey || !imageAlt || !linkUrl || !locale) {
    return invalidRequest('필수 항목이 비었거나 너무 깁니다.')
  }
  if (ctaLabel !== null && (typeof ctaLabel !== 'string' || ctaLabel.length > POPUP_LIMITS.ctaLabel)) {
    return invalidRequest('버튼 문구는 50자 이하여야 합니다.')
  }
  if (
    minAppVersion !== null &&
    (typeof minAppVersion !== 'string' || minAppVersion.length > POPUP_LIMITS.minAppVersion)
  ) {
    return invalidRequest('최소 앱 버전이 너무 깁니다.')
  }
  // enum·Instant 바인딩 실패는 본문 해석 실패라 COMMON400(BE HttpMessageNotReadable)
  if (!linkTarget || !audience || !hideOption || startsAt === null || endsAt === null) {
    return commonBadRequest()
  }
  if (!Number.isInteger(priority) || typeof active !== 'boolean') {
    return invalidRequest('우선순위·노출 여부가 올바르지 않습니다.')
  }

  // 정책(POPUP400) — 링크·기간·버전 → 이미지
  if (!isHttpsLink(linkUrl) || endsAt <= startsAt) return invalidPopup()
  if (minAppVersion !== null && !isValidAppVersion(minAppVersion as string)) return invalidPopup()
  if (!POPUP_IMAGE_KEY_RE.test(imageKey) || !isObjectUploaded(imageKey)) return invalidPopup()

  return {
    title,
    imageKey,
    imageAlt,
    ctaLabel: ctaLabel as string | null,
    linkUrl,
    linkTarget,
    audience,
    locale,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    priority: priority as number,
    hideOption,
    active,
    minAppVersion: minAppVersion as string | null,
  }
}

function findLivePopup(id: number | null): DbPopup | undefined {
  return db.popups.find((p) => p.id === id && p.deletedAt === null)
}

export const adminPopupHandlers = [
  // GET /admin/popups — 목록(삭제분 제외 · popupId DESC). status는 조회 시각 파생값으로 거른다
  http.get(api('/admin/popups'), ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const url = new URL(request.url)
    const params = pageParams(url)
    if (params instanceof Response) return params
    const rawStatus = url.searchParams.get('status')
    const status = rawStatus ? oneOf(POPUP_STATUSES, rawStatus) : null
    if (rawStatus && !status) return commonBadRequest()

    const now = Date.now()
    const rows = db.popups
      .filter((p) => p.deletedAt === null)
      .map((p) => toAdminPopupResponse(p, now))
      .filter((p) => !status || p.status === status)
      .sort((a, b) => b.popupId - a.popupId)
    return paged(rows, params.page, params.size)
  }),

  // POST /admin/popups/images/presign — /:popupId보다 먼저(경로 일치 순서)
  http.post(api('/admin/popups/images/presign'), async ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const body = await readJson<{ contentType?: unknown; size?: unknown }>(request)
    if (!body) return invalidBody()
    const { contentType, size } = body
    if (typeof contentType !== 'string' || contentType.trim() === '') {
      return invalidRequest('contentType 는 필수입니다.')
    }
    if (typeof size !== 'number' || size < 1 || size > POPUP_IMAGE_MAX_BYTES) {
      return invalidRequest('이미지는 10MB 이하여야 합니다.')
    }
    const extension = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : null
    if (!extension) return invalidPopup()

    const key = `popups/${gate.id}/${crypto.randomUUID()}.${extension}`
    return ok({
      key,
      uploadUrl: `${window.location.origin}/mock-s3/${key}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
  }),

  // 가짜 S3 PUT — 팝업 이미지만 본문을 받아 둔다(미리보기·목록 썸네일이 실제 이미지를 그리게).
  // 사진 업로드의 일반 `/mock-s3/*`보다 먼저 등록돼야 한다(handlers/index.ts 순서)
  http.put('/mock-s3/popups/*', async ({ request }) => {
    const key = decodeURIComponent(new URL(request.url).pathname.slice('/mock-s3/'.length))
    const blob = await request.blob()
    storePopupImage(key, URL.createObjectURL(blob))
    markObjectUploaded(key)
    return new HttpResponse(null, { status: 200 })
  }),

  http.get(api('/admin/popups/:popupId'), ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const popup = findLivePopup(toId(params.popupId))
    if (!popup) return popupNotFound()
    return ok(toAdminPopupResponse(popup))
  }),

  http.post(api('/admin/popups'), async ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const body = await readJson<Record<string, unknown>>(request)
    if (!body) return invalidBody()
    const content = readPopupContent(body)
    if (content instanceof Response) return content

    const now = nowIso()
    const popup: DbPopup = {
      ...content,
      id: nextId('popup'),
      createdBy: gate.id,
      updatedBy: gate.id,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    db.popups.push(popup)
    return created(toAdminPopupResponse(popup))
  }),

  // PUT — 전체 교체. popupId가 유지된다(앱의 '오늘 하루 보지 않기' 기록도 그대로 걸린다)
  http.put(api('/admin/popups/:popupId'), async ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const body = await readJson<Record<string, unknown>>(request)
    if (!body) return invalidBody()
    const content = readPopupContent(body)
    if (content instanceof Response) return content
    const popup = findLivePopup(toId(params.popupId))
    if (!popup) return popupNotFound()

    Object.assign(popup, content, { updatedBy: gate.id, updatedAt: nowIso() })
    return ok(toAdminPopupResponse(popup))
  }),

  http.patch(api('/admin/popups/:popupId/active'), async ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const body = await readJson<{ active?: unknown }>(request)
    if (!body) return invalidBody()
    if (typeof body.active !== 'boolean') return invalidRequest('active 는 필수입니다.')
    const popup = findLivePopup(toId(params.popupId))
    if (!popup) return popupNotFound()

    popup.active = body.active
    popup.updatedBy = gate.id
    popup.updatedAt = nowIso()
    return ok(toAdminPopupResponse(popup))
  }),

  // DELETE — deletedAt 기록(행은 남는다). 성공은 result 없는 공통 응답
  http.delete(api('/admin/popups/:popupId'), ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const popup = findLivePopup(toId(params.popupId))
    if (!popup) return popupNotFound()

    popup.deletedAt = nowIso()
    popup.updatedBy = gate.id
    return ok(undefined)
  }),
]

// ── 혜택 푸시 ────────────────────────────────────────────────────────

/** 실 BE 디스패처의 지연(5초 주기)을 흉내 — 즉시 발송이 '대기 중'으로 잠깐 보이게 */
const MOCK_DISPATCH_DELAY_MS = 3000

/**
 * 만기된 QUEUED·SCHEDULED를 처리한다(BE CampaignDispatcher의 목 대응물).
 * 야간이면 다음 08:00으로 미루고, 테스트는 그 사용자의 적격 기기로, 나머지는 토픽으로 보낸다.
 */
function settleCampaigns(nowMs = Date.now()): void {
  const now = new Date(nowMs)
  for (const campaign of db.pushCampaigns) {
    if (campaign.status !== 'QUEUED' && campaign.status !== 'SCHEDULED') continue
    if (new Date(campaign.dueAt).getTime() > nowMs) continue
    if (!isCampaignDaytime(now)) {
      campaign.dueAt = nextCampaignDaytime(now).toISOString()
      continue
    }
    if (campaign.testUserId !== null) {
      const devices = campaignDevicesOf(campaign.testUserId)
      if (devices.length === 0) {
        campaign.status = 'FAILED'
        campaign.failureCode = 'NO_ELIGIBLE_DEVICES'
        continue
      }
      campaign.fcmMessageIds = devices.map(
        (_, i) => `projects/cheese-moa/messages/mock-${campaign.id}-${i + 1}`,
      )
    } else {
      campaign.fcmMessageIds = [`projects/cheese-moa/messages/mock-${campaign.id}`]
    }
    campaign.status = 'SENT'
    campaign.sentAt = now.toISOString()
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 접수 공통(BE CampaignRegistrar) — 즉시·예약·테스트가 같은 길을 탄다.
 * 키 확인이 시각 검증보다 **먼저**다: 예약 시각이 지난 뒤의 네트워크 재시도도 같은 결과를 받는다.
 */
async function register(
  request: Request,
  adminId: number,
  kind: 'campaign' | 'test',
): Promise<Response> {
  const key = request.headers.get('Idempotency-Key')
  if (!key) return invalidRequest('Idempotency-Key 는 필수입니다.')
  if (!UUID_RE.test(key)) return commonBadRequest()

  const body = await readJson<Record<string, unknown>>(request)
  if (!body) return invalidBody()
  const allowed = kind === 'test' ? ['title', 'body', 'link', 'userId'] : ['title', 'body', 'link', 'scheduledAt']
  // 모르는 필드(topic, 테스트의 scheduledAt 등)는 BE가 @JsonAnySetter로 거부한다
  if (Object.keys(body).some((field) => !allowed.includes(field))) return commonBadRequest()

  const title = nonBlank(body.title, CAMPAIGN_LIMITS.title)
  const text = nonBlank(body.body, CAMPAIGN_LIMITS.body)
  const link = body.link ?? null
  if (!title || !text) return invalidRequest('제목·본문이 비었거나 너무 깁니다.')
  if (link !== null && (typeof link !== 'string' || link.length > CAMPAIGN_LIMITS.link)) {
    return invalidRequest('링크가 너무 깁니다.')
  }
  let scheduledAt: number | null = null
  if (kind === 'campaign' && body.scheduledAt !== undefined && body.scheduledAt !== null) {
    scheduledAt = instantOf(body.scheduledAt)
    if (scheduledAt === null) return commonBadRequest()
  }
  let testUserId: number | null = null
  if (kind === 'test') {
    if (typeof body.userId !== 'number' || !Number.isInteger(body.userId) || body.userId < 1) {
      return invalidRequest('userId 는 1 이상이어야 합니다.')
    }
    testUserId = body.userId
  }

  const hash = JSON.stringify({ title, text, link, scheduledAt, testUserId })
  const existing = db.pushCampaigns.find((c) => c.createdBy === adminId && c.requestKey === key)
  if (existing) {
    if (existing.requestHash !== hash) return campaignConflict()
    settleCampaigns()
    return accepted(toAdminCampaignResponse(existing))
  }

  const nowMs = Date.now()
  const due = scheduledAt ?? nowMs
  if (scheduledAt !== null && scheduledAt <= nowMs) return invalidCampaign()
  if (!isCampaignDaytime(new Date(due))) return invalidCampaign()
  if (link !== null && !isHttpsLink(link as string)) return invalidCampaign()
  if (testUserId !== null && campaignDevicesOf(testUserId).length === 0) return invalidCampaign()
  if (campaignPayloadBytes({ title, body: text, link: link as string | null }) > CAMPAIGN_LIMITS.payloadBytes) {
    return invalidCampaign()
  }

  const campaign: DbPushCampaign = {
    id: nextId('campaign'),
    status: scheduledAt === null ? 'QUEUED' : 'SCHEDULED',
    title: adTitle(title),
    body: adBody(text),
    link: link as string | null,
    requestKey: key,
    requestHash: hash,
    createdBy: adminId,
    testUserId,
    scheduledAt: scheduledAt === null ? null : new Date(scheduledAt).toISOString(),
    dueAt: new Date(scheduledAt ?? nowMs + MOCK_DISPATCH_DELAY_MS).toISOString(),
    sentAt: null,
    cancelledBy: null,
    cancelledAt: null,
    fcmMessageIds: [],
    failureCode: null,
    createdAt: new Date(nowMs).toISOString(),
  }
  db.pushCampaigns.push(campaign)
  return accepted(toAdminCampaignResponse(campaign))
}

export const adminCampaignHandlers = [
  // GET /admin/push-campaigns/recipients — /:campaignId보다 먼저(경로 일치 순서)
  http.get(api('/admin/push-campaigns/recipients'), ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    return ok(campaignRecipientCounts())
  }),

  http.post(api('/admin/push-campaigns/test'), async ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    return register(request, gate.id, 'test')
  }),

  http.post(api('/admin/push-campaigns'), async ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    return register(request, gate.id, 'campaign')
  }),

  // GET /admin/push-campaigns — 이력(campaignId DESC · 테스트 포함)
  http.get(api('/admin/push-campaigns'), ({ request }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    const params = pageParams(new URL(request.url))
    if (params instanceof Response) return params
    settleCampaigns()
    const rows = [...db.pushCampaigns].sort((a, b) => b.id - a.id).map(toAdminCampaignResponse)
    return paged(rows, params.page, params.size)
  }),

  http.get(api('/admin/push-campaigns/:campaignId'), ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    settleCampaigns()
    const campaign = db.pushCampaigns.find((c) => c.id === toId(params.campaignId))
    if (!campaign) return errorResponse(404, 'CAMPAIGN404', '발송 이력을 찾을 수 없습니다.')
    return ok(toAdminCampaignResponse(campaign))
  }),

  // POST …/cancel — SCHEDULED에서만. 정산 먼저: 만기가 지난 예약은 이미 보내져 409가 된다
  http.post(api('/admin/push-campaigns/:campaignId/cancel'), ({ request, params }) => {
    const gate = adminGate(request)
    if (gate instanceof Response) return gate
    settleCampaigns()
    const campaign = db.pushCampaigns.find((c) => c.id === toId(params.campaignId))
    if (!campaign) return errorResponse(404, 'CAMPAIGN404', '발송 이력을 찾을 수 없습니다.')
    if (campaign.status !== 'SCHEDULED') return campaignConflict()

    campaign.status = 'CANCELLED'
    campaign.cancelledBy = gate.id
    campaign.cancelledAt = nowIso()
    return ok(toAdminCampaignResponse(campaign))
  }),
]
