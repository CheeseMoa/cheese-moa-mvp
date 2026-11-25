/** CHMO-958/978/993 운영 설정 DTO. 인증은 공용 관리자 client 계층을 사용한다. */
import { ApiRequestError, apiFetch, apiFetchWithHeaders } from '../../api/client'

export type Platform = 'ios' | 'android'
export type Locale = 'ko' | 'en' | 'ja'
export interface AttendanceSettings {
  enabled: boolean
  sendTime: string
  copy: Record<Locale, { title: string; body: string }>
}
/** BE CHMO-973 QuestPolicy. 구 서버 응답·옛 이력에는 없을 수 있다. */
export interface QuestSettings {
  enabled: boolean
  createGroupReward: number
  uploadPhotoReward: number
  inviteFriendReward: number
}
export interface InstitutionSubscriptionSettings {
  offerEnabled: boolean
  purchaseEnabled: boolean
}
/**
 * BE CHMO-993 서비스 상태(`ServiceSettings`). NORMAL 밖의 모르는 값도 문자열로 보존한다(앱은 읽기
 * 전용으로 해석). 관리자 응답은 세 언어 키를 항상 싣고, 언어·필드 null은 앱 기본 문구를 쓴다는 뜻이다.
 * updatedAt은 mode·notice가 실제로 바뀐 저장 시각(서버 관리 · PATCH로 보내면 SETTINGS400, 바뀐 적 없으면 null).
 */
export type ServiceMode = 'NORMAL' | 'READ_ONLY'
export interface ServiceNoticeCopy {
  title?: string | null
  body?: string | null
}
export interface ServiceSettings {
  mode: ServiceMode | (string & {})
  notice?: Partial<Record<Locale, ServiceNoticeCopy | null>> | null
  updatedAt?: string | null
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
  // 구 서버 응답에는 없을 수 있고, CHMO-978 이전 이력은 null을 보존한다.
  quest?: QuestSettings | null
  institutionSubscription?: InstitutionSubscriptionSettings | null
  // BE CHMO-993 배포 전 응답과 그 이전 이력에는 없다.
  service?: ServiceSettings | null
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
  // 스테이징 실측: W/"0". 이 API의 태그는 콘텐츠 해시가 아닌 숫자 revision이다.
  // BE SettingsWriteHeaders는 If-Match에 강한 형태의 숫자 태그를 요구한다.
  const revision = etag?.match(/^(?:W\/)?("[0-9]+")$/)?.[1]
  if (!revision)
    throw new ApiRequestError(
      200,
      'INVALID_SETTINGS_RESPONSE',
      '출석 설정은 조회됐지만 변경 버전(ETag)을 읽지 못했어요. 다시 조회해 주세요.',
    )
  return { settings: result, etag: revision }
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
