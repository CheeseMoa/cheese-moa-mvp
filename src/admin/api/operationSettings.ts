/** CHMO-958 PR #329 DTO·컨트롤러 계약. 보안 추가 인증은 CHMO-934 확정 후 연결한다. */
import { apiFetch, apiFetchWithHeaders } from '../../api/client'

export type Platform = 'ios' | 'android'
export type Locale = 'ko' | 'en' | 'ja'
export interface AttendanceSettings {
  enabled: boolean
  sendTime: string
  copy: Record<Locale, { title: string; body: string }>
}
export interface OperationValues {
  app: { minVersion: Record<Platform, string>; storeUrl?: Partial<Record<Platform, string>> }
  credit: {
    signupGrant: number
    dailyGrant: number
    cap: number
    migrationGrant: number
    enforcementStartsAt: string | null
    migrationCutoffAt: string | null
  }
  institution: { trialPeriod: string; gracePeriod: string }
  attendancePush: AttendanceSettings
}
export interface OperationSettings {
  revision: number
  updatedAt: string
  settings: OperationValues
  readOnly: {
    uploadLimits: { perRequest: number; perEvent: number; perGroup: number }
    appCompatibilityNotes: string[]
  }
}
export interface SettingsHistory {
  historyId: number
  revision: number
  actorUserId: number
  changedAt: string
  reason: string
  before: OperationValues
  after: OperationValues
  scope: string
  restoredFrom: number | null
}
export interface HistoryPage {
  items: SettingsHistory[]
  nextCursor: number | null
  hasNext: boolean
}
export type Snapshot = 'BEFORE' | 'AFTER'
export interface AttendanceStatistics {
  date: string
  selectedUsers: number
  acceptedUsers: number
  attendanceAfterAttemptUsers: number
  uploadAfterAttemptUsers: number
  deliveries: { status: string; count: number }[]
  recentFailures: { deliveryId: number; status: string; failureCode: string }[]
}
// 변경 객체는 폼의 허용 목록에서 구성하며, 변경하지 않은 leaf는 보내지 않는다.
export type SettingsChanges = Record<string, unknown>
const base = '/admin/operation-settings'
export const getOperationSettings = (signal?: AbortSignal) =>
  apiFetch<OperationSettings>(base, { signal })
export const changeOperationSettings = (
  expectedRevision: number,
  reason: string,
  changes: SettingsChanges,
) =>
  apiFetch<OperationSettings>(base, {
    method: 'PATCH',
    body: { expectedRevision, reason, changes },
  })
export const getSettingsHistory = (cursor?: number, signal?: AbortSignal) =>
  apiFetch<HistoryPage>(
    `${base}/history?size=20${cursor === undefined ? '' : `&cursor=${cursor}`}`,
    { signal },
  )
export const restoreSettings = (
  historyId: number,
  expectedRevision: number,
  reason: string,
  snapshot: Snapshot,
) =>
  apiFetch<OperationSettings>(`${base}/history/${historyId}/restore`, {
    method: 'POST',
    body: { expectedRevision, reason, snapshot },
  })
const attendance = '/admin/notifications/daily-attendance'
export async function getAttendanceSettings(signal?: AbortSignal) {
  const { result, headers } = await apiFetchWithHeaders<AttendanceSettings>(
    `${attendance}/settings`,
    { signal },
  )
  const etag = headers.get('ETag')
  if (!etag || !/^"[0-9]+"$/.test(etag))
    throw new Error('출석 설정의 revision을 확인할 수 없어요. 다시 조회해 주세요.')
  return { settings: result, etag }
}
export const updateAttendanceSettings = (
  settings: AttendanceSettings,
  etag: string,
  reason: string,
) =>
  apiFetch<AttendanceSettings>(`${attendance}/settings`, {
    method: 'PUT',
    headers: { 'If-Match': etag, 'X-Change-Reason': encodeURIComponent(reason) },
    body: settings,
  })
export const getAttendanceStatistics = (date: string, signal?: AbortSignal) =>
  apiFetch<AttendanceStatistics>(`${attendance}/statistics?date=${encodeURIComponent(date)}`, {
    signal,
  })

/** 저장 성공 뒤 조회 실패를 구분한다. 쓰기는 재시도하지 않고 인증 오류도 호출부에 보존한다. */
export async function saveAndReloadSettings(write: () => Promise<unknown>) {
  await write()
  try {
    return { value: await getOperationSettings(), refreshError: null }
  } catch (refreshError) {
    return { value: null, refreshError }
  }
}
