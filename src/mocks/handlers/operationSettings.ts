/** 로컬 화면 검증 전용. 계약 검증에는 이 핸들러를 사용하지 않는다. */
import { http, HttpResponse } from 'msw'
import { api, ok, errorResponse } from './shared'
import { adminGate } from './admin'
import { createOperationSettingsDemo } from '../operationSettingsData'
import type {
  AttendanceSettings,
  OperationValues,
  ServiceSettings,
  SettingsHistory,
} from '../../admin/api/operationSettings'
let current = createOperationSettingsDemo()
const history: SettingsHistory[] = []
const failure = (status: number, code: string, message: string) =>
  errorResponse(status, code, message)
function record(
  actorUserId: number,
  reason: string,
  next: OperationValues,
  restoredFrom: number | null = null,
) {
  const before = structuredClone(current.settings)
  const now = new Date().toISOString()
  // BE ServiceSettings.stampedAgainst — mode·notice가 실제로 바뀐 저장에서만 변경 시각을 바꾼다
  if (next.service) next.service = stamped(next.service, before.service, now)
  current = {
    ...current,
    revision: current.revision + 1,
    settings: next,
    updatedAt: now,
  }
  history.unshift({
    historyId: history.length + 1,
    revision: current.revision,
    actorUserId,
    changedAt: current.updatedAt,
    reason,
    before,
    after: structuredClone(next),
    scope: 'GLOBAL',
    restoredFrom,
  })
  return ok(current)
}
function merge(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object')
      merge((target[key] ??= {}) as Record<string, unknown>, value as Record<string, unknown>)
    else target[key] = value
  }
}
// 로컬 화면에서 서버 거절도 시연한다. 실 BE 계약 검증의 대체물이 아니다.
function validQuest(values: OperationValues): boolean {
  const q = values.quest
  return Boolean(
    q &&
    typeof q.enabled === 'boolean' &&
    [q.createGroupReward, q.uploadPhotoReward, q.inviteFriendReward].every(Number.isInteger) &&
    q.createGroupReward > 0 &&
    q.uploadPhotoReward > 0 &&
    q.inviteFriendReward <= 10000 &&
    q.inviteFriendReward > Math.max(q.createGroupReward, q.uploadPhotoReward),
  )
}
// ── 서비스 일시 중단(BE CHMO-993 브랜치 ServiceSettings·SettingsPolicy·ReadOnlyModeInterceptor 대조) ──
const NOTICE_LOCALES = ['ko', 'en', 'ja'] as const
type Notices = Record<
  (typeof NOTICE_LOCALES)[number],
  { title: string | null; body: string | null }
>
/** 관리자 응답 모양 — 세 언어 키를 항상 싣고 앞뒤 공백을 걷어낸다(BE Notice 생성자) */
function normalizeService(service: ServiceSettings | null | undefined): ServiceSettings {
  const notice = Object.fromEntries(
    NOTICE_LOCALES.map((locale) => {
      const copy = service?.notice?.[locale]
      const strip = (text: unknown) => (typeof text === 'string' ? text.trim() : (text ?? null))
      return [locale, { title: strip(copy?.title), body: strip(copy?.body) }]
    }),
  ) as Notices
  return { mode: service?.mode ?? 'NORMAL', notice, updatedAt: service?.updatedAt ?? null }
}
function stamped(
  next: ServiceSettings,
  before: ServiceSettings | null | undefined,
  now: string,
): ServiceSettings {
  const changed =
    !before ||
    next.mode !== before.mode ||
    JSON.stringify(next.notice) !== JSON.stringify(normalizeService(before).notice)
  return { ...next, updatedAt: changed ? now : (before.updatedAt ?? null) }
}
/** PATCH 원문 검사 — 섹션 null·빈 객체·mode null·모르는 언어·서버 관리 updatedAt은 SETTINGS400 */
function validServicePatch(changes: Record<string, unknown>): boolean {
  if (!('service' in changes)) return true
  const service = changes.service as Record<string, unknown> | null
  if (!service || typeof service !== 'object' || Object.keys(service).length === 0) return false
  if ('updatedAt' in service || ('mode' in service && service.mode == null)) return false
  const notice = service.notice as Record<string, unknown> | null | undefined
  return notice == null || Object.keys(notice).every((key) => NOTICE_LOCALES.includes(key as never))
}
/** 병합 결과 검사 — 제목 1~40·본문 1~300(앞뒤 공백 제거 뒤 코드 포인트), 공백만은 불가 */
function validService(values: OperationValues): boolean {
  const service = values.service
  if (!service) return true
  if (service.mode !== 'NORMAL' && service.mode !== 'READ_ONLY') return false
  const valid = (text: unknown, max: number) =>
    text == null || (typeof text === 'string' && text.length > 0 && [...text].length <= max)
  return NOTICE_LOCALES.every((locale) => {
    const copy = service.notice?.[locale]
    return valid(copy?.title, 40) && valid(copy?.body, 300)
  })
}
/** 공개 /app/config의 service — 채운 언어·필드만, updatedAt은 null이면 생략(BE PublicAppConfigResponse) */
function publicService() {
  const service = normalizeService(current.settings.service)
  const notice = Object.fromEntries(
    NOTICE_LOCALES.map((locale) => [
      locale,
      Object.fromEntries(
        Object.entries(service.notice?.[locale] ?? {}).filter(([, text]) => text != null),
      ),
    ]).filter(([, copy]) => Object.keys(copy).length > 0),
  )
  return {
    mode: service.mode,
    ...(Object.keys(notice).length ? { notice } : {}),
    ...(service.updatedAt ? { updatedAt: service.updatedAt } : {}),
  }
}

/** 로컬 목의 현재 서비스 모드 — 쓰기 차단 핸들러가 읽는다 */
export function mockServiceMode(): string {
  return current.settings.service?.mode ?? 'NORMAL'
}
/** BE `SERVICE503` 봉투 — 허용 목록을 통과한 요청을 유스케이스가 막을 때(사진이 있는 이벤트 삭제)도 쓴다 */
export const serviceReadOnlyFailure = () =>
  failure(503, 'SERVICE503', '서비스 재정비 중에는 사진 보기와 저장만 할 수 있습니다.')

/**
 * 읽기 전용 운영 중 쓰기 차단 — BE ReadOnlyModeInterceptor.ALLOWED(메서드 + 매핑 경로 패턴)를 옮겼다.
 * 로컬 화면에서 SERVICE503 안내를 확인하는 용도이며 BE 규칙을 검증하지 않는다. 소셜 가입 코드 교환
 * 차단처럼 서버 상태가 필요한 판정은 목에서 하지 않는다(통과시킨다).
 */
const ALLOWED_WRITES = [
  'POST /auth/admin/login',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'POST /auth/social/{provider}/callback',
  'POST /auth/social/exchange',
  'DELETE /me',
  'POST /me/devices',
  'DELETE /me/devices/{token}',
  'PATCH /me/push-settings',
  'POST /agreements',
  'POST /me/reports',
  'POST /me/reports/attachments/presign',
  'POST /me/reports/{reportId}/read',
  'POST /groups/{groupId}/in-app-purchases/apple/verify',
  'POST /groups/{groupId}/in-app-purchases/google/verify',
  'POST /pass-purchases/verify',
  'POST /institution-subscriptions/verify',
  'POST /billing/store-notifications/apple',
  'POST /billing/store-notifications/google',
  'DELETE /groups/{groupId}/subscription',
  // 업로드는 전부 막는다(2026-11-25 재조율) — complete는 빠지고 취소와 빈 새 이벤트 정리만 연다
  'DELETE /upload-batches/{batchId}',
  'DELETE /events/{eventId}',
  'POST /events/{eventId}/viewed',
  'POST /groups/{groupId}/persons/{personId}/viewed',
  'POST /me/favorite-persons/{personId}/viewed',
].map((entry) => {
  const [method, pattern] = entry.split(' ')
  return { method, path: new RegExp(`^${pattern.replace(/\{[^}]+\}/g, '[^/]+')}$`) }
})
export const serviceReadOnlyGuard = http.all(api('/*'), ({ request }) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  if (mockServiceMode() === 'NORMAL') return
  const path = new URL(request.url).pathname.replace(/^\/api\/v1/, '')
  if (path.startsWith('/admin/')) return
  if (ALLOWED_WRITES.some(({ method, path: p }) => method === request.method && p.test(path)))
    return
  return serviceReadOnlyFailure()
})
function validSubscription(values: OperationValues): boolean {
  const p = values.institutionSubscription
  return Boolean(
    p &&
    typeof p.offerEnabled === 'boolean' &&
    typeof p.purchaseEnabled === 'boolean' &&
    (!p.purchaseEnabled || p.offerEnabled),
  )
}
export const operationSettingsHandlers = [
  // 봉투 없는 공개 응답. service는 NORMAL이어도 내려주고 notice는 채운 언어·필드만 싣는다.
  http.get(api('/app/config'), () =>
    HttpResponse.json({ ...current.settings.app, service: publicService() }),
  ),
  http.get(api('/admin/operation-settings'), ({ request }) => {
    const user = adminGate(request)
    return user instanceof Response ? user : ok(current)
  }),
  http.patch(api('/admin/operation-settings'), async ({ request }) => {
    const user = adminGate(request)
    if (user instanceof Response) return user
    const input = (await request.json()) as {
      expectedRevision: number
      reason: string
      changes: Record<string, unknown>
    }
    if (input.expectedRevision !== current.revision)
      return failure(409, 'SETTINGS409', '설정이 변경되었어요.')
    if (!input.reason?.trim() || input.reason.length > 500 || !input.changes)
      return failure(400, 'SETTINGS400', '변경 내용을 확인해 주세요.')
    if (!validServicePatch(input.changes))
      return failure(400, 'SETTINGS400', '서비스 상태 설정을 확인해 주세요.')
    const next = structuredClone(current.settings)
    merge(next as unknown as Record<string, unknown>, input.changes)
    next.service = normalizeService(next.service)
    if (!validQuest(next)) return failure(400, 'SETTINGS400', '퀘스트 보상 설정을 확인해 주세요.')
    if (!validSubscription(next))
      return failure(400, 'SETTINGS400', '월 구독 설정을 확인해 주세요.')
    if (!validService(next)) return failure(400, 'SETTINGS400', '서비스 상태 설정을 확인해 주세요.')
    return record(user.id, input.reason, next)
  }),
  http.get(api('/admin/operation-settings/history'), ({ request }) => {
    const user = adminGate(request)
    if (user instanceof Response) return user
    const cursor = Number(new URL(request.url).searchParams.get('cursor') ?? Infinity)
    const items = history.filter((h) => h.historyId < cursor).slice(0, 20)
    const hasNext = history.some((h) => h.historyId < (items[items.length - 1]?.historyId ?? 0))
    return ok({ items, nextCursor: hasNext ? items[items.length - 1]?.historyId : null, hasNext })
  }),
  http.post(api('/admin/operation-settings/history/:id/restore'), async ({ request, params }) => {
    const user = adminGate(request)
    if (user instanceof Response) return user
    const input = (await request.json()) as {
      expectedRevision: number
      reason: string
      snapshot: 'BEFORE' | 'AFTER'
    }
    if (input.expectedRevision !== current.revision)
      return failure(409, 'SETTINGS409', '설정이 변경되었어요.')
    const item = history.find((h) => h.historyId === Number(params.id))
    if (!item) return failure(404, 'SETTINGS404', '이력을 찾을 수 없어요.')
    const next = structuredClone(input.snapshot === 'BEFORE' ? item.before : item.after)
    // CHMO-978: 원본 이력에 없던 새 정책은 현재 값을 유지한다.
    next.quest ??= current.settings.quest
    next.institutionSubscription ??= current.settings.institutionSubscription
    // CHMO-993: 이 기능 이전 이력(service 없음)으로 복원하면 현재 값을 유지한다
    next.service = normalizeService(next.service ?? current.settings.service)
    if (!validQuest(next)) return failure(400, 'SETTINGS400', '퀘스트 보상 설정을 확인해 주세요.')
    if (!validSubscription(next))
      return failure(400, 'SETTINGS400', '월 구독 설정을 확인해 주세요.')
    next.credit.migrationCutoffAt = current.settings.credit.migrationCutoffAt
    return record(user.id, input.reason, next, item.historyId)
  }),
  http.get(api('/admin/notifications/daily-attendance/settings'), ({ request }) => {
    const user = adminGate(request)
    if (user instanceof Response) return user
    const response = ok(current.settings.attendancePush)
    response.headers.set('ETag', `"${current.revision}"`)
    return response
  }),
  http.put(api('/admin/notifications/daily-attendance/settings'), async ({ request }) => {
    const user = adminGate(request)
    if (user instanceof Response) return user
    if (request.headers.get('If-Match') !== `"${current.revision}"`)
      return failure(409, 'SETTINGS409', '설정이 변경되었어요.')
    const reason = decodeURIComponent(request.headers.get('X-Change-Reason') ?? '')
    if (!reason.trim()) return failure(400, 'VALID400', '변경 사유가 필요해요.')
    const value = (await request.json()) as AttendanceSettings
    record(user.id, reason, { ...current.settings, attendancePush: value })
    return ok(value)
  }),
  http.get(api('/admin/notifications/daily-attendance/statistics'), ({ request }) => {
    const user = adminGate(request)
    if (user instanceof Response) return user
    return ok({
      date: new URL(request.url).searchParams.get('date'),
      selectedUsers: 0,
      acceptedUsers: 0,
      attendanceAfterAttemptUsers: 0,
      uploadAfterAttemptUsers: 0,
      deliveries: [],
      recentFailures: [],
    })
  }),
]
