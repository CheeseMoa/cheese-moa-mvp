/**
 * MSW 목 데이터 스토어 (docs/api-spec.md §2 리소스 스키마 기반).
 *
 * - 인메모리 단일 스토어: 새로고침 시 fixtures로 재시드된다.
 *   → 토큰은 서버 세션 없이 자기서술형(`mock-access.<userId>`)으로 발급해 재시드 후에도 유효.
 * - BE 내부 모델(멤버십 N:M, personId 이름 맵, 앨범↔사진 N:M)을 그대로 보관하고,
 *   핸들러가 API 노출 형태(Group/Event/Album/Photo)로 직렬화한다.
 * - 상태전이·이름전파·다대다 헬퍼는 CHMO-109(앨범·검수·공개·뷰어 핸들러)에서도 재사용한다.
 */
import type {
  AgreementScope,
  AgreementType,
  AlbumType,
  AnalysisStatus,
  EventStatus,
  FaceBbox,
  ISODate,
  ISODateTime,
  PhotoFlags,
} from '../types/api'

// ── 내부 레코드 타입 (BE 내부 모델 포함 — API 응답에 그대로 노출 금지) ──

export interface DbUser {
  id: number
  nickname: string
  /** 4자리 PIN — 응답에 절대 포함하지 않는다 */
  pin: string
  createdAt: ISODateTime
}

export interface DbGroup {
  id: number
  name: string
  /** 선생님 합류용 모임 비밀번호(초대 화면 전용 노출) */
  password: string
  /** 선생님용 참여 코드 — 어느 링크로 합류했는지가 role을 정한다(학부모 전환 Q6) */
  joinKey: string
  /** 학부모용 참여 코드(joinKey 2종 — CHMO-444). 비밀번호는 share.password 재사용(Q2) */
  parentJoinKey: string
  /** 학부모 무로그인 공유(모임 단위) — 생성 시 자동 발급. 뷰어 폐기 전까지 유지 */
  share: {
    token: string
    /** 학부모 전용 비밀번호(모임 비밀번호와 별개) — 학부모 합류 비밀번호로 재사용(Q2) */
    password: string
  }
  createdAt: ISODateTime
}

export type DbMemberRole = 'teacher' | 'parent'
export type DbMembershipStatus = 'pending' | 'active'

/**
 * 유저↔모임 멤버십 (N:M) — 학부모 전환(CHMO-444)으로 role·승인 상태를 갖는다.
 * PENDING 행이 곧 합류 신청이다(id = joinRequestId 겸용) — 거절은 행 삭제, 승인은 active 전이.
 */
export interface DbMembership {
  id: number
  userId: number
  groupId: number
  role: DbMemberRole
  status: DbMembershipStatus
  /** 학부모 신청 원문(자유 텍스트, §2) — 연결 전까지 보존해 선생님이 참조. 선생님은 빈 배열 */
  childNames: string[]
  createdAt: ISODateTime
}

/** 학부모↔인물 매핑(다대다 — 다자녀·부모 2인 허용, §2). 모임 스코프는 person이 안다 */
export interface DbPersonParent {
  userId: number
  personId: number
}

export interface DbEvent {
  id: number
  groupId: number
  name: string
  date: ISODate
  status: EventStatus
  createdAt: ISODateTime
  publishedAt: ISODateTime | null
}

/** 모임 단위 인물(대표 벡터의 목 대응물) — 이름의 소스 오브 트루스 */
export interface DbPerson {
  id: number
  groupId: number
  name: string
}

export interface DbAlbum {
  id: number
  eventId: number
  type: AlbumType
  /** 인물 앨범만 값 보유 — 이름은 persons 맵에서 조회(이름전파) */
  personId: number | null
  /** 검토 상태는 사진 단위(DbPhoto.reviewed) — 앨범은 보유하지 않는다 */
  coverPhotoId: number | null
}

export interface DbPhoto {
  id: number
  eventId: number
  /** 원본 오브젝트 키(등록 시 클라이언트가 되돌려 보낸 presign 키) — BE PhotoInAlbumResponse.s3Key */
  s3Key: string
  /** 앨범과 다대다 — 비어 있으면 어떤 앨범에도 안 보임 */
  albumIds: number[]
  /** 목 이미지 URL 조립용 내부 값 — API 응답엔 노출하지 않는다(BE도 치수를 주지 않는다) */
  width: number
  height: number
  flags: PhotoFlags
  /** 검토 여부(사진 단위) — 앨범 [검토 완료] = 일괄 처리. 실 BE는 매핑(AlbumPhoto) 단위(CHMO-395 — 목은 사진 단위 근사) */
  reviewed: boolean
  /**
   * 발행 여부(재공개 게이트 CHMO-324) — [공개하기] 발행 액션으로만 켜진다(검토 완료는 표시일 뿐).
   * 뷰어 노출 게이트 = reviewed && published: 검토 해제는 published를 되돌리지 않고
   * 그 앨범 노출만 숨긴다(CHMO-395 — 노출을 줄이는 방향만 즉시 반영).
   */
  published: boolean
  /**
   * '분류가 어려워요' 분류 사유(CHMO-393·410) — BE처럼 uncertain 최초 분류 시에만 채우고
   * 이후 이동·재분석에도 사진에 남는다. 그 외 사진은 undefined(응답에서 키 생략).
   */
  faceBboxes?: FaceBbox[]
  causes?: string[]
  createdAt: ISODateTime
}

/**
 * 약관 동의 기록(BE `user_agreement` — CHMO-514). **append-only**: 재동의도 철회도 새 행이고
 * 기존 행을 고치지 않는다(그래서 unique 제약이 없다 — 동의→철회→재동의가 막히면 이력이 아니다).
 * 현재 상태는 "항목별 최신 행"으로 계산한다(latestUserAgreementOf).
 */
export interface DbAgreement {
  id: number
  userId: number
  type: AgreementType
  /** 제출된 버전 — 카탈로그의 현재 버전과 다르면 구버전 기록으로 남는다 */
  version: string
  /** 거부·철회도 행으로 기록 */
  agreed: boolean
  /** 모임 스코프 확인(child_consent_attested)만 값 보유 — 회원 동의는 null */
  groupId: number | null
  createdAt: ISODateTime
}

export interface DbAnalysisJob {
  eventId: number
  status: AnalysisStatus
  /** analyzing 시작 시각(ms) — 경과 시간으로 완료 전이·진행률 계산 */
  startedAt: number
  /** 이 job이 분류할 사진 수(시작 시점 미분류 사진) — 진행률 분모(CHMO-287) */
  total: number
  options: { excludeEyesClosed: boolean; excludeBlurry: boolean }
}

export interface Db {
  users: DbUser[]
  groups: DbGroup[]
  memberships: DbMembership[]
  personParents: DbPersonParent[]
  events: DbEvent[]
  persons: DbPerson[]
  albums: DbAlbum[]
  photos: DbPhoto[]
  agreements: DbAgreement[]
  analysisJobs: DbAnalysisJob[]
  /** S3에 실제로 PUT된 업로드 키 — BE `StoredObjectChecker`의 목 대응물(CHMO-194) */
  uploadedKeys: string[]
}

export const db: Db = {
  users: [],
  groups: [],
  memberships: [],
  personParents: [],
  events: [],
  persons: [],
  albums: [],
  photos: [],
  agreements: [],
  analysisJobs: [],
  uploadedKeys: [],
}

/** fixtures 시드/테스트 리셋용 — 전체 교체 */
export function seedDb(data: Db): void {
  db.users = data.users
  db.groups = data.groups
  db.memberships = data.memberships
  db.personParents = data.personParents
  db.events = data.events
  db.persons = data.persons
  db.albums = data.albums
  db.photos = data.photos
  db.agreements = data.agreements
  db.analysisJobs = data.analysisJobs
  db.uploadedKeys = data.uploadedKeys
}

// ── 업로드 오브젝트 (S3 시뮬 — CHMO-194) ─────────────────────

/** BE `PhotoKeyGenerator.keyPrefixOf` — 등록 시 이 이벤트의 키인지 검증한다 */
export function uploadKeyPrefixOf(eventId: number): string {
  return `originals/events/${eventId}/`
}

/** 가짜 S3 PUT 성공 기록 — 등록 단계가 "PUT하지 않은 키"를 거를 수 있게 */
export function markObjectUploaded(s3Key: string): void {
  if (!db.uploadedKeys.includes(s3Key)) db.uploadedKeys.push(s3Key)
}

export function isObjectUploaded(s3Key: string): boolean {
  return db.uploadedKeys.includes(s3Key)
}

// ── ID 발급 ──────────────────────────────────────────────────

const idCounters: Record<string, number> = {}

/** 리소스 종류별 순차 숫자 ID(BE int64 대응) — 시드 ID(≤400)와 충돌하지 않게 1001부터 */
export function nextId(kind: string): number {
  idCounters[kind] = (idCounters[kind] ?? 1000) + 1
  return idCounters[kind]
}

/** 외부에서 유입된 ID(localStorage 보존 계정 등) 뒤로 카운터를 밀어 신규 발급 충돌을 막는다 */
export function syncIdCounter(kind: string, id: number): void {
  idCounters[kind] = Math.max(idCounters[kind] ?? 1000, id)
}

export function nowIso(): ISODateTime {
  return new Date().toISOString()
}

/** 로컬(한국) 달력 기준 오늘 — toISOString()은 UTC라 KST 자정~09시엔 하루 전 날짜가 된다 */
export function todayIsoDate(): ISODate {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// ── 자기서술형 목 토큰 (재시드에도 유효한 무상태 토큰) ─────────

const ACCESS_PREFIX = 'mock-access.'
const REFRESH_PREFIX = 'mock-refresh.'
const VIEWER_PREFIX = 'mock-viewer.'

export function issueAccessToken(userId: number): string {
  return `${ACCESS_PREFIX}${userId}`
}

/**
 * refreshToken 발급 (CHMO-193) — 매번 고유(회전). seq를 붙여 로그아웃/재발급으로 무효화한
 * 토큰이 이후 재로그인이 발급하는 토큰과 문자열이 겹치지 않게 한다(무효화는 정확 문자열 매칭).
 */
export function issueRefreshToken(userId: number): string {
  return `${REFRESH_PREFIX}${userId}.${nextId('refresh')}`
}

export function issueViewerToken(shareToken: string): string {
  return `${VIEWER_PREFIX}${shareToken}`
}

// 무효화된 refreshToken(로그아웃·회전) — 세션 스코프 인메모리 집합(재시드/새로고침에 소멸)
const revokedRefreshTokens = new Set<string>()

/** 로그아웃/회전 시 refreshToken 무효화 — 이후 재발급 시도는 401 */
export function revokeRefreshToken(refreshToken: string): void {
  revokedRefreshTokens.add(refreshToken)
}

/** refreshToken에서 제작자 유저 해석(형식 오류·유저 없음·무효화됨이면 null) */
export function resolveUserFromRefreshToken(refreshToken: string): DbUser | null {
  if (!refreshToken.startsWith(REFRESH_PREFIX)) return null
  if (revokedRefreshTokens.has(refreshToken)) return null
  const userId = Number(refreshToken.slice(REFRESH_PREFIX.length).split('.')[0])
  return db.users.find((u) => u.id === userId) ?? null
}

/** Authorization 헤더에서 제작자 유저를 해석(없거나 무효면 null) */
export function resolveUser(authorization: string | null): DbUser | null {
  const token = bearerToken(authorization)
  if (!token?.startsWith(ACCESS_PREFIX)) return null
  const userId = Number(token.slice(ACCESS_PREFIX.length))
  return db.users.find((u) => u.id === userId) ?? null
}

/** Authorization 헤더에서 뷰어 토큰의 모임 공유 token을 해석 */
export function resolveViewerShareToken(authorization: string | null): string | null {
  const token = bearerToken(authorization)
  if (!token?.startsWith(VIEWER_PREFIX)) return null
  return token.slice(VIEWER_PREFIX.length)
}

function bearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) return null
  return authorization.slice('Bearer '.length)
}

// ── 조회 헬퍼 ────────────────────────────────────────────────

export function findGroup(groupId: number | null): DbGroup | undefined {
  return db.groups.find((g) => g.id === groupId)
}

export function findEvent(eventId: number | null): DbEvent | undefined {
  return db.events.find((e) => e.id === eventId)
}

export function findAlbum(albumId: number | null): DbAlbum | undefined {
  return db.albums.find((a) => a.id === albumId)
}

export function findPhoto(photoId: number | null): DbPhoto | undefined {
  return db.photos.find((p) => p.id === photoId)
}

// ── 멤버십·신청 (학부모 전환 CHMO-444 — role·승인제) ─────────

export function membershipOf(userId: number, groupId: number): DbMembership | undefined {
  return db.memberships.find((m) => m.userId === userId && m.groupId === groupId)
}

/** 제작자 액션(업로드·검수·공개·설정·초대·매핑)의 관문 — 학부모 차단은 서버 강제(§6) */
export function isActiveTeacher(userId: number, groupId: number): boolean {
  const membership = membershipOf(userId, groupId)
  return membership?.status === 'active' && membership.role === 'teacher'
}

/**
 * 멤버십 생성 — 모임 생성자는 active teacher로 즉시 확정, 참여(join)는 신청(pending)으로
 * 생성돼 승인(approve) 시 active 전이. PENDING 행의 id가 joinRequestId다.
 */
export function createMembership(input: {
  userId: number
  groupId: number
  role: DbMemberRole
  status: DbMembershipStatus
  childNames?: string[]
}): DbMembership {
  const membership: DbMembership = {
    id: nextId('mbr'),
    userId: input.userId,
    groupId: input.groupId,
    role: input.role,
    status: input.status,
    childNames: input.childNames ?? [],
    createdAt: nowIso(),
  }
  db.memberships.push(membership)
  return membership
}

export function findMembershipById(id: number | null): DbMembership | undefined {
  return db.memberships.find((m) => m.id === id)
}

/** 내 멤버십 전체(PENDING 포함) — 홈 목록은 대기 신청 모임도 비활성 카드로 보여준다(§7-2) */
export function membershipsOfUser(userId: number): DbMembership[] {
  return db.memberships.filter((m) => m.userId === userId)
}

/** ACTIVE 멤버 목록(초대 관리 §4) — 대기 신청은 pendingRequestsOfGroup */
export function activeMembersOfGroup(groupId: number): DbMembership[] {
  return db.memberships.filter((m) => m.groupId === groupId && m.status === 'active')
}

/** 대기 중인 합류 신청(§3 — 역할 무관 승인제) */
export function pendingRequestsOfGroup(groupId: number): DbMembership[] {
  return db.memberships.filter((m) => m.groupId === groupId && m.status === 'pending')
}

// ── 학부모↔인물 매핑 (§2·§4 — 다대다) ────────────────────────

export function hasPersonParent(userId: number, personId: number): boolean {
  return db.personParents.some((pp) => pp.userId === userId && pp.personId === personId)
}

export function linkPersonParent(userId: number, personId: number): void {
  if (!hasPersonParent(userId, personId)) db.personParents.push({ userId, personId })
}

/** 매핑 해제 — 미연결(매핑 0건)로 회귀할 뿐 새 상태는 없다(§7-1 안전망과 동일 결) */
export function unlinkPersonParent(userId: number, personId: number): void {
  db.personParents = db.personParents.filter(
    (pp) => !(pp.userId === userId && pp.personId === personId),
  )
}

/**
 * 멤버 제거(내보내기·나가기 — BE CHMO-525 RemoveSpaceMemberUseCase 대응): 이 모임 인물에 대한
 * 매핑 → 멤버십(신청 이름 포함) 순으로 지운다. 사진·앨범·인물은 모임 자산이라 건드리지 않는다 —
 * 선생님이 나가도 남은 선생님의 앨범은 그대로고, 나간 학부모는 열람 범위(매핑)만 잃는다.
 */
export function removeMembershipCascade(membership: DbMembership): void {
  const groupPersonIds = new Set(
    db.persons.filter((p) => p.groupId === membership.groupId).map((p) => p.id),
  )
  db.personParents = db.personParents.filter(
    (pp) => !(pp.userId === membership.userId && groupPersonIds.has(pp.personId)),
  )
  db.memberships = db.memberships.filter((m) => m.id !== membership.id)
}

/** 이 모임에서 학부모에게 매핑된 인물들 — 열람 권한의 실체(모임 단위라 이벤트를 관통, §2) */
export function mappedPersonsOf(userId: number, groupId: number): DbPerson[] {
  const personIds = new Set(
    db.personParents.filter((pp) => pp.userId === userId).map((pp) => pp.personId),
  )
  return db.persons.filter((p) => p.groupId === groupId && personIds.has(p.id))
}

/**
 * 학부모에게 보이는 앨범(§5 스코프) = 매핑된 인물 앨범 + 공통 앨범, 노출 사진
 * (reviewed && published — CHMO-324 게이트 그대로)이 1장 이상인 것.
 * 학부모 화면엔 앨범 계층이 없지만(§3 플랫) 이벤트 목록의 카운트·커버 파생 기준이 된다.
 */
export function parentVisibleAlbumsOfEvent(eventId: number, userId: number): DbAlbum[] {
  const event = findEvent(eventId)
  if (!event) return []
  const mappedIds = new Set(mappedPersonsOf(userId, event.groupId).map((p) => p.id))
  return albumsOfEvent(eventId).filter(
    (a) =>
      (a.type === 'common' ||
        (a.type === 'person' && a.personId !== null && mappedIds.has(a.personId))) &&
      viewerPhotosOfAlbum(a.id).length > 0,
  )
}

/**
 * "아이가 나온 이벤트" 판정(CHMO-448 노출 강화 — ⚠ BE 미협의 제안) — 매핑된 인물 앨범에
 * 노출 사진이 1장 이상. 학부모에겐 이 이벤트만 존재한다(목록 필터·사진 게이트 공용):
 * 공통(단체)만 있는 이벤트는 통째로 숨고, 미연결(매핑 0건)이면 어떤 이벤트도 보이지 않는다.
 */
export function parentEventHasMappedChild(eventId: number, userId: number): boolean {
  const event = findEvent(eventId)
  if (!event) return false
  const mappedIds = new Set(mappedPersonsOf(userId, event.groupId).map((p) => p.id))
  return albumsOfEvent(eventId).some(
    (a) =>
      a.type === 'person' &&
      a.personId !== null &&
      mappedIds.has(a.personId) &&
      viewerPhotosOfAlbum(a.id).length > 0,
  )
}

/**
 * 학부모 노출 사진(§5 — 뷰어 노출 규칙 이관): 위 앨범들의 노출 사진. 다대다라 중복 제거.
 * 공통 포함 — 단, 이벤트 자체가 아이 등장(parentEventHasMappedChild)일 때만 조회된다.
 */
export function parentVisiblePhotosOfEvent(eventId: number, userId: number): DbPhoto[] {
  const photos = new Map<number, DbPhoto>()
  for (const album of parentVisibleAlbumsOfEvent(eventId, userId)) {
    for (const photo of viewerPhotosOfAlbum(album.id)) photos.set(photo.id, photo)
  }
  return [...photos.values()]
}

// ── 약관 동의 (BE CHMO-514 — AgreementType enum + user_agreement) ──

export interface AgreementCatalogItem {
  type: AgreementType
  /** 항목별 현재 유효 버전 — 문서를 개정하면 올린다(그 순간 기존 동의가 재동의 대상이 된다) */
  currentVersion: string
  required: boolean
  scope: AgreementScope
}

/**
 * BE `AgreementType` enum의 목 대응물 — 문구 전문은 담지 않는다(정본은 src/legal/).
 * 순서까지 BE 그대로: 가입 동의 화면이 이 순서로 항목을 그린다(CHMO-479).
 */
export const AGREEMENT_CATALOG: AgreementCatalogItem[] = [
  { type: 'age_14_over', currentVersion: '1.0', required: true, scope: 'user' },
  { type: 'terms_of_service', currentVersion: '1.0', required: true, scope: 'user' },
  { type: 'privacy_policy', currentVersion: '1.0', required: true, scope: 'user' },
  { type: 'face_data', currentVersion: '1.0', required: true, scope: 'user' },
  { type: 'marketing', currentVersion: '1.0', required: false, scope: 'user' },
  { type: 'child_consent_attested', currentVersion: '1.0', required: true, scope: 'group' },
]

/** 아동 보호자 동의 확보 확인 항목 — 업로드 게이트가 요구하는 그 항목 */
export const GUARDIAN_CONSENT_TYPE: AgreementType = 'child_consent_attested'

export function agreementCatalogOf(type: AgreementType): AgreementCatalogItem | undefined {
  return AGREEMENT_CATALOG.find((item) => item.type === type)
}

/**
 * 회원(user 스코프) 항목의 최신 기록 — 상태 판정·멱등 스킵의 기준.
 * 뒤에서부터 찾는다(append-only라 뒤가 최신). 모임 스코프 행(groupId 보유)은 섞이지 않게 제외.
 */
export function latestUserAgreementOf(userId: number, type: AgreementType): DbAgreement | undefined {
  for (let i = db.agreements.length - 1; i >= 0; i -= 1) {
    const row = db.agreements[i]
    if (row.userId === userId && row.type === type && row.groupId === null) return row
  }
  return undefined
}

export function recordAgreement(input: {
  userId: number
  type: AgreementType
  version: string
  agreed: boolean
  groupId?: number | null
}): DbAgreement {
  const row: DbAgreement = {
    id: nextId('agr'),
    userId: input.userId,
    type: input.type,
    version: input.version,
    agreed: input.agreed,
    groupId: input.groupId ?? null,
    createdAt: nowIso(),
  }
  db.agreements.push(row)
  return row
}

/**
 * 그 모임의 보호자 동의 확보 확인이 **이 선생님 이름으로** 현재 버전으로 남아 있는가.
 * 선생님별로 쌓인다 — 각자 자신의 동의 확보 의무를 확인하는 것이므로 다른 선생님의 확인으로
 * 갈음되지 않는다(BE GuardianConsentGuard와 동일 규칙).
 */
export function guardianConsentAttested(userId: number, groupId: number): boolean {
  const version = agreementCatalogOf(GUARDIAN_CONSENT_TYPE)?.currentVersion
  return db.agreements.some(
    (row) =>
      row.userId === userId &&
      row.type === GUARDIAN_CONSENT_TYPE &&
      row.groupId === groupId &&
      row.version === version &&
      row.agreed,
  )
}

export function eventsOfGroup(groupId: number): DbEvent[] {
  return db.events.filter((e) => e.groupId === groupId)
}

/** 이벤트 목록 정렬 비교자 — 최신 날짜 우선, 같은 날짜면 생성 시각 최신 우선(제작자·뷰어 목록 공통) */
export function byEventRecency(a: DbEvent, b: DbEvent): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
}

export function albumsOfEvent(eventId: number): DbAlbum[] {
  return db.albums.filter((a) => a.eventId === eventId)
}

/** 이벤트에 등록된 사진 전체(앨범 소속 여부 무관) */
export function photosOfEvent(eventId: number): DbPhoto[] {
  return db.photos.filter((p) => p.eventId === eventId)
}

export function photosOfAlbum(albumId: number): DbPhoto[] {
  return db.photos.filter((p) => p.albumIds.includes(albumId))
}

// ── 파생 카운트 ──────────────────────────────────────────────

/** ACTIVE 멤버 수(역할 합산 — 과도기 병행 필드, §7-3). 대기 신청은 세지 않는다 */
export function memberCountOf(groupId: number): number {
  return activeMembersOfGroup(groupId).length
}

/** 카운트 분리(§7-3) — "선생님 3 · 학부모 12". 합산 memberCount는 선생님에게 무의미 */
export function teacherCountOf(groupId: number): number {
  return activeMembersOfGroup(groupId).filter((m) => m.role === 'teacher').length
}

export function parentCountOf(groupId: number): number {
  return activeMembersOfGroup(groupId).filter((m) => m.role === 'parent').length
}

export function eventCountOf(groupId: number): number {
  return eventsOfGroup(groupId).length
}

export function photoCountOfEvent(eventId: number): number {
  return photosOfEvent(eventId).length
}

export function albumCountOf(eventId: number): number {
  return albumsOfEvent(eventId).length
}

export function photoCountOfAlbum(albumId: number): number {
  return photosOfAlbum(albumId).length
}

export function unreviewedCountOfAlbum(albumId: number): number {
  return photosOfAlbum(albumId).filter((p) => !p.reviewed).length
}

/** 뷰어 노출 사진 = 검토 완료 && 발행됨(CHMO-324·395) — 뷰어 응답·뷰어용 카운트/커버 파생의 기준 */
export function viewerPhotosOfAlbum(albumId: number): DbPhoto[] {
  return photosOfAlbum(albumId).filter((p) => p.reviewed && p.published)
}

// ── 발행 (재공개 게이트 CHMO-324) ────────────────────────────

/**
 * 발행 게이트 대상 = **전 사진이 검토 완료된 인물·공통 앨범**(BE PublishMomentUseCase).
 * 검수하다 만 앨범은 검토된 사진까지 통째로 대기하고, 특수 앨범은 발행 대상이 아니다
 * (published를 켜두면 나중에 인물 앨범으로 옮겼을 때 발행 없이 즉시 노출된다).
 */
function publishableAlbumsOf(eventId: number): DbAlbum[] {
  return albumsOfEvent(eventId).filter(
    (a) =>
      (a.type === 'person' || a.type === 'common') &&
      photoCountOfAlbum(a.id) > 0 &&
      unreviewedCountOfAlbum(a.id) === 0,
  )
}

/**
 * 공개 게이트에 걸린 미검토 사진 수(CHMO-488) — **인물·공통 앨범만** 센다.
 * 특수 앨범(분류 애매·눈감음·흔들림)은 09에 검토 UI가 아예 없어(CHMO-357) 게이트에 넣으면
 * 영영 공개할 수 없는 이벤트가 생긴다 — 실 BE·14 화면 판정과 같은 범위다.
 * 한 사진이 여러 앨범에 걸쳐 있어도 1장으로 센다(다대다).
 */
export function unreviewedGatePhotoCount(eventId: number): number {
  const unreviewed = new Set<number>()
  for (const album of albumsOfEvent(eventId)) {
    if (album.type !== 'person' && album.type !== 'common') continue
    for (const photo of photosOfAlbum(album.id)) if (!photo.reviewed) unreviewed.add(photo.id)
  }
  return unreviewed.size
}

/**
 * 발행 액션(POST /publish — 재호출 포함): 게이트 통과 앨범의 사진을 published로 전환하고
 * **이번에 새로 발행된 장수**를 반환한다(BE publishedPhotoCount — 재호출이면 0일 수 있다).
 */
export function publishEventPhotos(eventId: number): number {
  let publishedCount = 0
  for (const album of publishableAlbumsOf(eventId)) {
    for (const photo of photosOfAlbum(album.id)) {
      if (!photo.published) {
        photo.published = true
        publishedCount += 1
      }
    }
  }
  return publishedCount
}

/**
 * 발행 대기 수(BE pendingPublishCount) — 지금 [공개하기]를 누르면 새로 나갈 사진 수.
 * 게이트 기준으로 세므로 "대기 > 0 ⇔ 발행이 실제로 뭔가 한다"가 항상 성립한다
 * (게이트에 걸린 앨범의 검토분을 세면 눌러도 안 빠지는 유령 대기가 생긴다).
 */
export function pendingPublishCountOf(eventId: number): number {
  const pending = new Set<number>()
  for (const album of publishableAlbumsOf(eventId)) {
    for (const photo of photosOfAlbum(album.id)) {
      if (!photo.published) pending.add(photo.id)
    }
  }
  return pending.size
}

// ── 인물 이름 (personId 단위 공유 — 이름전파) ────────────────

/**
 * 앨범의 인물 이름 — BE와 동일하게 **인물 앨범만 값을 갖고 특수 앨범은 null**이다.
 * 특수 앨범 표시명('공통' 등)은 서버가 주지 않는다 — FE가 type에서 파생한다(api/mappers.ts).
 */
export function personNameOf(album: DbAlbum): string | null {
  if (album.type !== 'person') return null
  return db.persons.find((p) => p.id === album.personId)?.name ?? null
}

/**
 * 인물 이름 변경(이름전파) — personId 단위로 갱신하므로
 * 같은 모임 내 모든 이벤트의 해당 인물 앨범 이름이 함께 바뀐다.
 */
export function renamePerson(personId: number, name: string): void {
  const person = db.persons.find((p) => p.id === personId)
  if (person) person.name = name
}

// ── 앨범↔사진 다대다 헬퍼 ────────────────────────────────────

export function linkPhotoToAlbum(photoId: number, albumId: number): void {
  const photo = db.photos.find((p) => p.id === photoId)
  if (!photo || photo.albumIds.includes(albumId)) return
  photo.albumIds.push(albumId)
  // 커버 없는 앨범에 첫 사진이 들어오면 커버로 지정
  const album = findAlbum(albumId)
  if (album && !album.coverPhotoId) album.coverPhotoId = photoId
}

/** 해당 앨범 연결만 해제 — 다른 앨범 소속은 유지(마지막 연결 해제 = 실질 삭제) */
export function unlinkPhotoFromAlbum(photoId: number, albumId: number): void {
  const photo = db.photos.find((p) => p.id === photoId)
  if (!photo) return
  photo.albumIds = photo.albumIds.filter((id) => id !== albumId)
  // 0장이 돼도 앨범은 남긴다(CHMO-418 — 자동 삭제 폐지, 삭제는 수동 DELETE /albums/:id뿐).
  // 빠진 사진이 커버였다면 남은 첫 사진으로, 앨범이 비면 null(유령 커버 방지)
  const album = findAlbum(albumId)
  if (album?.coverPhotoId === photoId) {
    album.coverPhotoId = photosOfAlbum(albumId)[0]?.id ?? null
  }
}

/** 사진 이동 = source 연결 해제 + target 연결(복사 아님) */
export function movePhotoBetweenAlbums(
  photoId: number,
  sourceAlbumId: number,
  targetAlbumId: number,
): void {
  unlinkPhotoFromAlbum(photoId, sourceAlbumId)
  linkPhotoToAlbum(photoId, targetAlbumId)
}

/**
 * 앨범에서 사진 제거(DELETE /photos) — 마지막 연결 해제면 사진 레코드 자체를 폐기한다.
 * albumIds가 빈 채 남겨두면 증분 재분석("앨범 없는 사진만 분류")이 삭제한 사진을
 * 부활시키므로, "마지막 연결 해제 = 완전 삭제(복구 없음)" 스펙을 레코드 삭제로 구현.
 */
export function removePhotoFromAlbum(photoId: number, albumId: number): void {
  unlinkPhotoFromAlbum(photoId, albumId)
  const photo = db.photos.find((p) => p.id === photoId)
  if (photo && photo.albumIds.length === 0) {
    db.photos = db.photos.filter((p) => p.id !== photoId)
  }
}

/**
 * 검수 새 인물 앨범 생성(CHMO-416 + 빈 앨범 CHMO-456) — BE CreateAlbumUseCase의 목 대응물:
 * 수동 인물(얼굴 벡터 없음 — 목엔 벡터 개념이 없어 이름만) + 앨범 생성.
 * `source`를 주면 선택 사진을 소스에서 옮겨오고(생성=이동 — 09-1), 생략하면 **사진 0장**으로
 * 태어난다(08 — 빈 앨범은 1급 시민이라 그대로 남는다, CHMO-418).
 * 소스가 비어도 앨범은 남는다(unlinkPhotoFromAlbum이 커버만 비운다).
 * 이름 중복은 검사하지 않는다 — 실 BE도 personId를 따로 발급해 통과시킨다(2026-07-27 프로브).
 */
export function createManualPersonAlbum(
  eventId: number,
  groupId: number,
  name: string,
  source?: { sourceAlbumId: number; photoIds: number[] },
): DbAlbum {
  const person: DbPerson = { id: nextId('psn'), groupId, name }
  db.persons.push(person)
  const album: DbAlbum = {
    id: nextId('alb'),
    eventId,
    type: 'person',
    personId: person.id,
    coverPhotoId: null,
  }
  db.albums.push(album)
  if (source) {
    for (const photoId of source.photoIds) {
      movePhotoBetweenAlbums(photoId, source.sourceAlbumId, album.id)
    }
  }
  return album
}

/**
 * 앨범 삭제(CHMO-271) — 링크를 걷어내고 **이 앨범에만 남은 사진은 레코드째 폐기**한다
 * (BE: 다른 앨범 연결이 없는 사진만 Photo 삭제 + S3 원본·ZIP purge — 목엔 저장소가 없어 레코드만).
 * 인물(persons)은 모임 스코프라 보존 — 같은 personId를 다른 이벤트의 인물 앨범이 쓴다.
 */
export function deleteAlbumCascade(albumId: number): void {
  for (const photo of photosOfAlbum(albumId)) {
    photo.albumIds = photo.albumIds.filter((id) => id !== albumId)
    if (photo.albumIds.length === 0) db.photos = db.photos.filter((p) => p.id !== photo.id)
  }
  db.albums = db.albums.filter((a) => a.id !== albumId)
}

// ── 모임·이벤트 삭제 (연쇄) ──────────────────────────────────

/**
 * 이벤트 삭제 — 자식→부모 순: 사진 → 앨범 → 분석 job → 업로드 키 → 이벤트(CHMO-278).
 * 인물(persons)은 모임 스코프라 보존한다 — 다른 이벤트의 인물 앨범이 같은 personId를 쓴다.
 * published 이벤트도 레코드가 사라지므로 뷰어 공개 목록에서 자연히 빠진다.
 */
export function deleteEventCascade(eventId: number): void {
  const keyPrefix = uploadKeyPrefixOf(eventId)
  db.photos = db.photos.filter((p) => p.eventId !== eventId)
  db.albums = db.albums.filter((a) => a.eventId !== eventId)
  db.analysisJobs = db.analysisJobs.filter((j) => j.eventId !== eventId)
  db.uploadedKeys = db.uploadedKeys.filter((key) => !key.startsWith(keyPrefix))
  db.events = db.events.filter((e) => e.id !== eventId)
}

/**
 * 모임 삭제 — BE CHMO-273의 자식→부모 순 수동 삭제 대응(cascade 설정 없음):
 * 사진 → 앨범 → 분석 job → 업로드 키 → 이벤트 → 인물 → 멤버십 → 모임.
 * BE는 Person/PersonCluster를 보존하고 SpacePerson 행만 지우는데, 목의 persons가
 * 곧 SpacePerson(모임 스코프 이름 맵)이므로 함께 삭제한다.
 */
export function deleteGroupCascade(groupId: number): void {
  const eventIds = new Set(eventsOfGroup(groupId).map((e) => e.id))
  const keyPrefixes = [...eventIds].map(uploadKeyPrefixOf)
  db.photos = db.photos.filter((p) => !eventIds.has(p.eventId))
  db.albums = db.albums.filter((a) => !eventIds.has(a.eventId))
  db.analysisJobs = db.analysisJobs.filter((j) => !eventIds.has(j.eventId))
  db.uploadedKeys = db.uploadedKeys.filter((key) => !keyPrefixes.some((pre) => key.startsWith(pre)))
  db.events = db.events.filter((e) => e.groupId !== groupId)
  // 인물이 소멸하면 매핑은 자동 해제뿐(§7-1 안전망 — 자동 승계·재매핑 금지). persons 삭제 전에 수집
  const personIds = new Set(
    db.persons.filter((p) => p.groupId === groupId).map((p) => p.id),
  )
  db.personParents = db.personParents.filter((pp) => !personIds.has(pp.personId))
  db.persons = db.persons.filter((p) => p.groupId !== groupId)
  db.memberships = db.memberships.filter((m) => m.groupId !== groupId)
  db.groups = db.groups.filter((g) => g.id !== groupId)
}

// ── 이벤트 상태전이 ──────────────────────────────────────────

/**
 * 허용 전이(docs/feature-spec.md 상태머신):
 * empty --analyze--> analyzing --완료--> review --전 사진 reviewed--> ready --publish--> published
 * 업로드·분류는 이벤트당 1회라(CHMO-486) **analyzing으로 돌아오는 엣지는 empty에서만** 있다 —
 * 사진 추가로 인한 review·ready → analyzing 회귀, published 무전이 증분 분석은 폐지됐다.
 */
const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  empty: ['analyzing'],
  analyzing: ['review'],
  // published = force 공개(미검토 존재 시 409 경고 후 ?force=true) — 미검토 사진은 뷰어 비노출이라 안전
  // empty = 사진 전부 삭제 시 복귀(spec: empty = 사진 0장) — 0장이면 업로드가 다시 열린다
  review: ['ready', 'published', 'empty'],
  ready: ['review', 'published', 'empty'], // 검토 해제 시 review
  // 공개 후 편집·재발행은 상태 전이 없이 진행 — 뷰어 노출은 사진 reviewed && published로 제어(CHMO-324)
  published: [],
}

/** 허용된 전이만 적용, 성공 여부 반환 */
export function transitionEvent(eventId: number, to: EventStatus): boolean {
  const event = findEvent(eventId)
  if (!event) return false
  if (!EVENT_TRANSITIONS[event.status].includes(to)) return false
  event.status = to
  if (to === 'published') event.publishedAt = nowIso()
  return true
}

/** 전 사진 reviewed ↔ 아니면 review — 검토 상태·사진 집합 변경 후 재계산(CHMO-109에서 사용) */
export function recomputeEventReadiness(eventId: number): void {
  const event = findEvent(eventId)
  if (!event || (event.status !== 'review' && event.status !== 'ready')) return
  const photos = photosOfEvent(eventId)
  // 사진이 전부 사라졌으면 빈 이벤트로(spec: empty = 사진 0장) — '검수 중' 0장 상태 방지
  if (photos.length === 0) {
    transitionEvent(eventId, 'empty')
    return
  }
  transitionEvent(eventId, photos.every((p) => p.reviewed) ? 'ready' : 'review')
}

// ── 분석 시뮬레이션 (폴링 없음 — 조회 시점에 경과 시간으로 전이) ──

/** analyzing → done 전이까지 걸리는 목 지연(ms). 재진입/새로고침 시 완료 확인용 */
export const ANALYSIS_DURATION_MS = 8_000

export function findAnalysisJob(eventId: number): DbAnalysisJob | undefined {
  return db.analysisJobs.find((j) => j.eventId === eventId)
}

export function startAnalysis(
  eventId: number,
  options: { excludeEyesClosed: boolean; excludeBlurry: boolean },
): DbAnalysisJob {
  const existing = findAnalysisJob(eventId)
  const total = photosOfEvent(eventId).filter((p) => p.albumIds.length === 0).length
  const job: DbAnalysisJob = { eventId, status: 'analyzing', startedAt: Date.now(), total, options }
  if (existing) {
    Object.assign(existing, job)
    return existing
  }
  db.analysisJobs.push(job)
  return job
}

/**
 * AI 분석 진행률(CHMO-287) — BE EventDetailResponse의 `progress` 대응물.
 * 분석 중에만 non-null(BE는 완료 직후 잠시 100을 유지하지만, 목은 완료 즉시 이벤트가
 * review로 전이돼 화면이 그리드로 넘어가므로 흉내 낼 필요가 없다).
 * 경과 시간 비례로 processed를 계산한다 — 실 BE도 percent를 서버가 계산해 준다.
 */
export function progressOf(eventId: number): { processed: number; total: number; percent: number } | null {
  const job = findAnalysisJob(eventId)
  if (!job || job.status !== 'analyzing' || job.total === 0) return null
  const ratio = Math.min(1, (Date.now() - job.startedAt) / ANALYSIS_DURATION_MS)
  const processed = Math.min(job.total, Math.floor(ratio * job.total))
  return { processed, total: job.total, percent: Math.round((processed / job.total) * 100) }
}

/**
 * 분석 상태 조회 시 호출 — analyzing이고 목 지연이 지났으면
 * 앨범 생성 + job done + 이벤트 status→review 전이까지 수행한다.
 */
export function settleAnalysis(eventId: number): DbAnalysisJob | undefined {
  const job = findAnalysisJob(eventId)
  if (!job) return undefined
  if (job.status === 'analyzing' && Date.now() - job.startedAt >= ANALYSIS_DURATION_MS) {
    completeAnalysis(eventId)
  }
  return job
}

/**
 * 모임에 분석 중 이벤트가 있는가 — 모임 삭제·마지막 선생님 나가기의 MOMENT409 가드
 * (BE DeleteSpaceUseCase·RemoveSpaceMemberUseCase 대응, CHMO-564 스펙 대조).
 * 목 분석은 조회 시점에야 전이되므로 먼저 정산한다 — 안 하면 지연이 이미 지난
 * analyzing(사실상 완료)이 가드에 걸려 실 BE에 없는 거부를 만든다.
 */
export function hasAnalyzingEvent(groupId: number): boolean {
  const events = eventsOfGroup(groupId)
  events.forEach((e) => settleAnalysis(e.id))
  return events.some((e) => e.status === 'analyzing')
}

/** 목 인물 이름 풀 — 분석 완료 시 모임에 인물이 부족하면 여기서 생성 */
const PERSON_NAME_POOL = ['김민준', '이서연', '박하린', '최지우', '정도윤', '한소율']

/**
 * '분류가 어려워요' 사유 조합 풀 — AI 고정 계약 코드(CHMO-410)를 결정적으로 순회한다.
 * 빈 배열(품질·데이터 문제 아님 — 범용 문구 경로)까지 포함해 화면의 네 경로를 모두 시연한다.
 */
const UNCERTAIN_CAUSE_COMBOS: string[][] = [
  ['small_faces'],
  ['low_resolution', 'small_faces'],
  ['single_appearance'],
  [],
]

/**
 * uncertain 분류 사진에 애매 얼굴 bbox·사유를 부여(CHMO-412) — BE가 사진 최초 생성 시에만
 * 저장하는 것처럼(CHMO-393) 최초 분류 시 한 번만 부른다. bbox는 원본 px(사진 치수 기준 비율로
 * 결정적 산출), seed가 3의 배수인 사진은 얼굴 2개로 배열 계약을 시연한다.
 */
export function assignUncertainDetails(photo: DbPhoto, seed: number): void {
  const face = (fx: number, fy: number, fw: number): FaceBbox => ({
    x: Math.round(photo.width * fx),
    y: Math.round(photo.height * fy),
    w: Math.round(photo.width * fw),
    h: Math.round(photo.width * fw * 1.25),
  })
  photo.faceBboxes =
    seed % 3 === 0
      ? [face(0.16, 0.14, 0.2), face(0.58, 0.24, 0.16)]
      : [face(0.36, 0.18, 0.24)]
  photo.causes = UNCERTAIN_CAUSE_COMBOS[seed % UNCERTAIN_CAUSE_COMBOS.length]
}

/**
 * 목 AI 분류(증분): **아직 어떤 앨범에도 속하지 않은 사진만** 분류한다.
 * - 재분석 시 기존 앨범·수동 배치·검토 상태(사진 단위)는 건드리지 않는다.
 * - 같은 모임 인물(personId) 재사용 → 이벤트가 달라도 동일 인물이 이어진다.
 * - 일부 사진은 인물 앨범 2곳에 연결해 다대다를 시뮬레이션.
 * - 특수 앨범(공통/분류어려움/눈감음/흔들림)은 들어갈 사진이 생길 때만 생성(빈 앨범 미생성).
 * - excludeEyesClosed/excludeBlurry ON이면 플래그 사진을 인물 대신 특수 앨범으로 라우팅.
 * - 새로 분류된 사진은 미검토(reviewed: false) 상태 그대로 → 검토 완료 전까지 뷰어 비노출.
 */
export function completeAnalysis(eventId: number): void {
  const event = findEvent(eventId)
  const job = findAnalysisJob(eventId)
  if (!event || !job) return

  const pending = photosOfEvent(eventId).filter((p) => p.albumIds.length === 0)
  if (pending.length > 0) {
    const makeAlbum = (type: AlbumType, personId: number | null = null): DbAlbum => {
      const album: DbAlbum = { id: nextId('alb'), eventId, type, personId, coverPhotoId: null }
      db.albums.push(album)
      return album
    }

    // 인물 앨범: 기존 것을 재사용, 없으면(첫 분석) 모임 인물 확보 후 3개 생성
    let personAlbums = albumsOfEvent(eventId).filter((a) => a.type === 'person')
    if (personAlbums.length === 0) {
      const persons = db.persons.filter((p) => p.groupId === event.groupId)
      while (persons.length < 3) {
        const used = new Set(persons.map((p) => p.name))
        const name = PERSON_NAME_POOL.find((n) => !used.has(n)) ?? `아이 ${persons.length + 1}`
        const person: DbPerson = { id: nextId('psn'), groupId: event.groupId, name }
        db.persons.push(person)
        persons.push(person)
      }
      personAlbums = persons.slice(0, 3).map((p) => makeAlbum('person', p.id))
    }

    // 특수 앨범: 사진이 실제로 라우팅될 때 기존 재사용 또는 지연 생성
    const specialAlbum = (type: AlbumType): DbAlbum =>
      albumsOfEvent(eventId).find((a) => a.type === type) ?? makeAlbum(type)

    pending.forEach((photo, i) => {
      // 품질 제외 옵션 ON이면 플래그 사진은 특수 앨범으로만 라우팅
      if (job.options.excludeEyesClosed && photo.flags.eyesClosed) {
        linkPhotoToAlbum(photo.id, specialAlbum('eyes_closed').id)
        return
      }
      if (job.options.excludeBlurry && photo.flags.blurry) {
        linkPhotoToAlbum(photo.id, specialAlbum('blurry').id)
        return
      }
      if (i % 10 === 9) {
        // BE는 uncertain 최초 생성 시에만 bbox·사유를 저장(CHMO-393·410) — pending(미분류)만 오므로 최초가 보장된다
        assignUncertainDetails(photo, i)
        linkPhotoToAlbum(photo.id, specialAlbum('uncertain').id)
        return
      }
      if (i % 6 === 5) {
        linkPhotoToAlbum(photo.id, specialAlbum('common').id)
        return
      }
      linkPhotoToAlbum(photo.id, personAlbums[i % personAlbums.length].id)
      // 매 4번째 사진은 다른 인물 앨범에도 연결(여러 아이 동반 촬영 = 다대다)
      if (i % 4 === 3) {
        linkPhotoToAlbum(photo.id, personAlbums[(i + 1) % personAlbums.length].id)
      }
    })
  }

  job.status = 'done'
  // 분류는 이벤트당 1회라 여기 오는 건 analyzing뿐 — analyzing → review로 검수 단계를 연다
  transitionEvent(eventId, 'review')
}
