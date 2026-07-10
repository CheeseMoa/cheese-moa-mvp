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
  AlbumType,
  AnalysisStatus,
  EventStatus,
  ISODate,
  ISODateTime,
  PhotoFlags,
} from '../types/api'
import { SPECIAL_ALBUM_LABELS, UNNAMED_PERSON_LABEL } from '../lib/albumLabels'

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
  /** 제작자 합류용 모임 비밀번호(초대 화면 전용 노출) */
  password: string
  joinKey: string
  /** 학부모 무로그인 공유(모임 단위) — 생성 시 자동 발급 */
  share: {
    token: string
    /** 학부모 전용 비밀번호(모임 비밀번호와 별개) */
    password: string
  }
  createdAt: ISODateTime
}

/** 유저↔모임 멤버십 (N:M) */
export interface DbMembership {
  userId: number
  groupId: number
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
  /** 앨범과 다대다 — 비어 있으면 어떤 앨범에도 안 보임 */
  albumIds: number[]
  width: number
  height: number
  flags: PhotoFlags
  /** 검토 여부(사진 단위) — 미검토 사진은 뷰어 응답에서 제외. 앨범 [검토 완료] = 일괄 처리 */
  reviewed: boolean
  createdAt: ISODateTime
}

export interface DbAnalysisJob {
  eventId: number
  status: AnalysisStatus
  /** analyzing 시작 시각(ms) — 경과 시간으로 완료 전이 판정 */
  startedAt: number
  options: { excludeEyesClosed: boolean; excludeBlurry: boolean }
}

export interface Db {
  users: DbUser[]
  groups: DbGroup[]
  memberships: DbMembership[]
  events: DbEvent[]
  persons: DbPerson[]
  albums: DbAlbum[]
  photos: DbPhoto[]
  analysisJobs: DbAnalysisJob[]
  /** S3에 실제로 PUT된 업로드 키 — BE `StoredObjectChecker`의 목 대응물(CHMO-194) */
  uploadedKeys: string[]
}

export const db: Db = {
  users: [],
  groups: [],
  memberships: [],
  events: [],
  persons: [],
  albums: [],
  photos: [],
  analysisJobs: [],
  uploadedKeys: [],
}

/** fixtures 시드/테스트 리셋용 — 전체 교체 */
export function seedDb(data: Db): void {
  db.users = data.users
  db.groups = data.groups
  db.memberships = data.memberships
  db.events = data.events
  db.persons = data.persons
  db.albums = data.albums
  db.photos = data.photos
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

export function isMember(userId: number, groupId: number): boolean {
  return db.memberships.some((m) => m.userId === userId && m.groupId === groupId)
}

export function addMembership(userId: number, groupId: number): void {
  if (!isMember(userId, groupId)) db.memberships.push({ userId, groupId })
}

export function groupsOfUser(userId: number): DbGroup[] {
  const groupIds = new Set(db.memberships.filter((m) => m.userId === userId).map((m) => m.groupId))
  return db.groups.filter((g) => groupIds.has(g.id))
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

export function memberCountOf(groupId: number): number {
  return db.memberships.filter((m) => m.groupId === groupId).length
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

/** 검토 완료 사진만 — 뷰어 응답·뷰어용 카운트/커버 파생의 기준 */
export function reviewedPhotosOfAlbum(albumId: number): DbPhoto[] {
  return photosOfAlbum(albumId).filter((p) => p.reviewed)
}

// ── 인물 이름 (personId 단위 공유 — 이름전파) ────────────────

/** 인물 앨범 이름 = 모임 단위 인물 이름. 특수 앨범은 고정 라벨(원천 lib/albumLabels.ts — UI와 공유) */
export { SPECIAL_ALBUM_LABELS }

export function albumName(album: DbAlbum): string {
  if (album.type === 'person') {
    const person = db.persons.find((p) => p.id === album.personId)
    return person?.name ?? UNNAMED_PERSON_LABEL
  }
  return SPECIAL_ALBUM_LABELS[album.type]
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
  // 빠진 사진이 커버였다면 남은 첫 사진으로 교체(없으면 비움)
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

// ── 이벤트 상태전이 ──────────────────────────────────────────

/**
 * 허용 전이(docs/feature-spec.md 상태머신):
 * empty --analyze--> analyzing --완료--> review --전 사진 reviewed--> ready --publish--> published
 * (사진 추가 시 재분석: review·ready → analyzing 회귀. published는 전이 없이 증분 분석 — 공개 유지.)
 */
const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  empty: ['analyzing'],
  analyzing: ['review'],
  // published = force 공개(미검토 존재 시 409 경고 후 ?force=true) — 미검토 사진은 뷰어 비노출이라 안전
  // empty = 사진 전부 삭제 시 복귀(spec: empty = 사진 0장)
  review: ['ready', 'analyzing', 'published', 'empty'],
  ready: ['review', 'published', 'analyzing', 'empty'], // 검토 해제 시 review, 재분석 시 analyzing
  published: [], // 공개 후 편집은 상태 전이 없이 진행(뷰어 비노출은 사진 reviewed로 제어)
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
  const job: DbAnalysisJob = { eventId, status: 'analyzing', startedAt: Date.now(), options }
  if (existing) {
    Object.assign(existing, job)
    return existing
  }
  db.analysisJobs.push(job)
  return job
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

/** 목 인물 이름 풀 — 분석 완료 시 모임에 인물이 부족하면 여기서 생성 */
const PERSON_NAME_POOL = ['김민준', '이서연', '박하린', '최지우', '정도윤', '한소율']

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
  // published 이벤트는 전이 엣지가 없어 공개 상태를 그대로 유지(증분 분석 — 공개 중 편집 허용)
  transitionEvent(eventId, 'review')
}
