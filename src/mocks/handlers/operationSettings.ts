/** 로컬 화면 검증 전용. 계약 검증에는 이 핸들러를 사용하지 않는다. */
import { http, HttpResponse } from 'msw'
import { api, ok, errorResponse } from './shared'
import { adminGate } from './admin'
import { createOperationSettingsDemo } from '../operationSettingsData'
import type {
  AttendanceSettings,
  OperationValues,
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
  current = {
    ...current,
    revision: current.revision + 1,
    settings: next,
    updatedAt: new Date().toISOString(),
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
  http.get(api('/app/config'), () => HttpResponse.json(current.settings.app)),
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
    const next = structuredClone(current.settings)
    merge(next as unknown as Record<string, unknown>, input.changes)
    if (!validQuest(next)) return failure(400, 'SETTINGS400', '퀘스트 보상 설정을 확인해 주세요.')
    if (!validSubscription(next))
      return failure(400, 'SETTINGS400', '월 구독 설정을 확인해 주세요.')
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
