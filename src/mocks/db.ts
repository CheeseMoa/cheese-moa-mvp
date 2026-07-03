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

// ── 내부 레코드 타입 (BE 내부 모델 포함 — API 응답에 그대로 노출 금지) ──

export interface DbUser {
  id: string
  nickname: string
  /** 4자리 PIN — 응답에 절대 포함하지 않는다 */
  pin: string
  createdAt: ISODateTime
}

export interface DbGroup {
  id: string
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
  userId: string
  groupId: string
}

export interface DbEvent {
  id: string
  groupId: string
  name: string
  date: ISODate
  status: EventStatus
  createdAt: ISODateTime
  publishedAt: ISODateTime | null
}

/** 모임 단위 인물(대표 벡터의 목 대응물) — 이름의 소스 오브 트루스 */
export interface DbPerson {
  id: string
  groupId: string
  name: string
}

export interface DbAlbum {
  id: string
  eventId: string
  type: AlbumType
  /** 인물 앨범만 값 보유 — 이름은 persons 맵에서 조회(이름전파) */
  personId: string | null
  reviewStatus: 'unreviewed' | 'reviewed'
  coverPhotoId: string | null
}

export interface DbPhoto {
  id: string
  eventId: string
  /** 앨범과 다대다 — 비어 있으면 어떤 앨범에도 안 보임 */
  albumIds: string[]
  width: number
  height: number
  flags: PhotoFlags
  createdAt: ISODateTime
}

export interface DbAnalysisJob {
  eventId: string
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
}

// ── ID 발급 ──────────────────────────────────────────────────

const idCounters: Record<string, number> = {}

/** 접두사별 순차 ID(`usr_101`, `evt_102`…) — 시드 ID와 충돌하지 않게 101부터 */
export function nextId(prefix: string): string {
  idCounters[prefix] = (idCounters[prefix] ?? 100) + 1
  return `${prefix}_${idCounters[prefix]}`
}

export function nowIso(): ISODateTime {
  return new Date().toISOString()
}

export function todayIsoDate(): ISODate {
  return new Date().toISOString().slice(0, 10)
}

// ── 자기서술형 목 토큰 (재시드에도 유효한 무상태 토큰) ─────────

const ACCESS_PREFIX = 'mock-access.'
const VIEWER_PREFIX = 'mock-viewer.'

export function issueAccessToken(userId: string): string {
  return `${ACCESS_PREFIX}${userId}`
}

export function issueViewerToken(shareToken: string): string {
  return `${VIEWER_PREFIX}${shareToken}`
}

/** Authorization 헤더에서 제작자 유저를 해석(없거나 무효면 null) */
export function resolveUser(authorization: string | null): DbUser | null {
  const token = bearerToken(authorization)
  if (!token?.startsWith(ACCESS_PREFIX)) return null
  const userId = token.slice(ACCESS_PREFIX.length)
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

export function findGroup(groupId: string): DbGroup | undefined {
  return db.groups.find((g) => g.id === groupId)
}

export function findEvent(eventId: string): DbEvent | undefined {
  return db.events.find((e) => e.id === eventId)
}

export function findAlbum(albumId: string): DbAlbum | undefined {
  return db.albums.find((a) => a.id === albumId)
}

export function isMember(userId: string, groupId: string): boolean {
  return db.memberships.some((m) => m.userId === userId && m.groupId === groupId)
}

export function addMembership(userId: string, groupId: string): void {
  if (!isMember(userId, groupId)) db.memberships.push({ userId, groupId })
}

export function groupsOfUser(userId: string): DbGroup[] {
  const groupIds = new Set(db.memberships.filter((m) => m.userId === userId).map((m) => m.groupId))
  return db.groups.filter((g) => groupIds.has(g.id))
}

export function eventsOfGroup(groupId: string): DbEvent[] {
  return db.events.filter((e) => e.groupId === groupId)
}

export function albumsOfEvent(eventId: string): DbAlbum[] {
  return db.albums.filter((a) => a.eventId === eventId)
}

/** 이벤트에 등록된 사진 전체(앨범 소속 여부 무관) */
export function photosOfEvent(eventId: string): DbPhoto[] {
  return db.photos.filter((p) => p.eventId === eventId)
}

export function photosOfAlbum(albumId: string): DbPhoto[] {
  return db.photos.filter((p) => p.albumIds.includes(albumId))
}

// ── 파생 카운트 ──────────────────────────────────────────────

export function memberCountOf(groupId: string): number {
  return db.memberships.filter((m) => m.groupId === groupId).length
}

export function eventCountOf(groupId: string): number {
  return eventsOfGroup(groupId).length
}

export function photoCountOfEvent(eventId: string): number {
  return photosOfEvent(eventId).length
}

export function albumCountOf(eventId: string): number {
  return albumsOfEvent(eventId).length
}

export function photoCountOfAlbum(albumId: string): number {
  return photosOfAlbum(albumId).length
}

// ── 인물 이름 (personId 단위 공유 — 이름전파) ────────────────

/** 인물 앨범 이름 = 모임 단위 인물 이름. 특수 앨범은 고정 라벨 */
export const SPECIAL_ALBUM_LABELS: Record<Exclude<AlbumType, 'person'>, string> = {
  common: '공통',
  uncertain: '분류가 어려워요',
  eyes_closed: '눈감은 사진',
  blurry: '흔들린 사진',
}

export function albumName(album: DbAlbum): string {
  if (album.type === 'person') {
    const person = db.persons.find((p) => p.id === album.personId)
    return person?.name ?? '이름 없음'
  }
  return SPECIAL_ALBUM_LABELS[album.type]
}

/**
 * 인물 이름 변경(이름전파) — personId 단위로 갱신하므로
 * 같은 모임 내 모든 이벤트의 해당 인물 앨범 이름이 함께 바뀐다.
 */
export function renamePerson(personId: string, name: string): void {
  const person = db.persons.find((p) => p.id === personId)
  if (person) person.name = name
}

// ── 앨범↔사진 다대다 헬퍼 ────────────────────────────────────

export function linkPhotoToAlbum(photoId: string, albumId: string): void {
  const photo = db.photos.find((p) => p.id === photoId)
  if (photo && !photo.albumIds.includes(albumId)) photo.albumIds.push(albumId)
}

/** 해당 앨범 연결만 해제 — 다른 앨범 소속은 유지(마지막 연결 해제 = 실질 삭제) */
export function unlinkPhotoFromAlbum(photoId: string, albumId: string): void {
  const photo = db.photos.find((p) => p.id === photoId)
  if (photo) photo.albumIds = photo.albumIds.filter((id) => id !== albumId)
}

/** 사진 이동 = source 연결 해제 + target 연결(복사 아님) */
export function movePhotoBetweenAlbums(
  photoId: string,
  sourceAlbumId: string,
  targetAlbumId: string,
): void {
  unlinkPhotoFromAlbum(photoId, sourceAlbumId)
  linkPhotoToAlbum(photoId, targetAlbumId)
}

// ── 이벤트 상태전이 ──────────────────────────────────────────

/**
 * 허용 전이(docs/feature-spec.md 상태머신):
 * empty --analyze--> analyzing --완료--> review --전 앨범 reviewed--> ready --publish--> published
 */
const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  empty: ['analyzing'],
  analyzing: ['review'],
  review: ['ready'],
  ready: ['review', 'published'], // 검토 해제 시 review로 되돌아갈 수 있음
  published: [],
}

/** 허용된 전이만 적용, 성공 여부 반환 */
export function transitionEvent(eventId: string, to: EventStatus): boolean {
  const event = findEvent(eventId)
  if (!event) return false
  if (!EVENT_TRANSITIONS[event.status].includes(to)) return false
  event.status = to
  if (to === 'published') event.publishedAt = nowIso()
  return true
}

/** 전 앨범 reviewed ↔ 아니면 review — 검토 상태 변경 후 재계산(CHMO-109에서 사용) */
export function recomputeEventReadiness(eventId: string): void {
  const event = findEvent(eventId)
  if (!event || (event.status !== 'review' && event.status !== 'ready')) return
  const albums = albumsOfEvent(eventId)
  const allReviewed = albums.length > 0 && albums.every((a) => a.reviewStatus === 'reviewed')
  transitionEvent(eventId, allReviewed ? 'ready' : 'review')
}

// ── 분석 시뮬레이션 (폴링 없음 — 조회 시점에 경과 시간으로 전이) ──

/** analyzing → done 전이까지 걸리는 목 지연(ms). 재진입/새로고침 시 완료 확인용 */
export const ANALYSIS_DURATION_MS = 8_000

export function findAnalysisJob(eventId: string): DbAnalysisJob | undefined {
  return db.analysisJobs.find((j) => j.eventId === eventId)
}

export function startAnalysis(
  eventId: string,
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
export function settleAnalysis(eventId: string): DbAnalysisJob | undefined {
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
 * 목 AI 분류: 이벤트 사진을 앨범 세트(인물 3 + 공통/분류어려움 + 옵션별 특수)로 분배.
 * - 같은 모임 인물(personId) 재사용 → 이벤트가 달라도 동일 인물이 이어진다.
 * - 일부 사진은 인물 앨범 2곳에 연결해 다대다를 시뮬레이션.
 * - excludeEyesClosed/excludeBlurry ON이면 플래그 사진을 인물 대신 특수 앨범으로 라우팅.
 */
export function completeAnalysis(eventId: string): void {
  const event = findEvent(eventId)
  const job = findAnalysisJob(eventId)
  if (!event || !job) return

  // 모임 인물 확보(부족하면 이름 풀에서 생성)
  const persons = db.persons.filter((p) => p.groupId === event.groupId)
  while (persons.length < 3) {
    const used = new Set(persons.map((p) => p.name))
    const name = PERSON_NAME_POOL.find((n) => !used.has(n)) ?? `아이 ${persons.length + 1}`
    const person: DbPerson = { id: nextId('psn'), groupId: event.groupId, name }
    db.persons.push(person)
    persons.push(person)
  }

  const makeAlbum = (type: AlbumType, personId: string | null = null): DbAlbum => {
    const album: DbAlbum = {
      id: nextId('alb'),
      eventId,
      type,
      personId,
      reviewStatus: 'unreviewed',
      coverPhotoId: null,
    }
    db.albums.push(album)
    return album
  }

  const personAlbums = persons.slice(0, 3).map((p) => makeAlbum('person', p.id))
  const commonAlbum = makeAlbum('common')
  const uncertainAlbum = makeAlbum('uncertain')
  const eyesClosedAlbum = job.options.excludeEyesClosed ? makeAlbum('eyes_closed') : null
  const blurryAlbum = job.options.excludeBlurry ? makeAlbum('blurry') : null

  photosOfEvent(eventId).forEach((photo, i) => {
    // 품질 제외 옵션 ON이면 플래그 사진은 특수 앨범으로만 라우팅
    if (eyesClosedAlbum && photo.flags.eyesClosed) {
      linkPhotoToAlbum(photo.id, eyesClosedAlbum.id)
      return
    }
    if (blurryAlbum && photo.flags.blurry) {
      linkPhotoToAlbum(photo.id, blurryAlbum.id)
      return
    }
    if (i % 10 === 9) {
      linkPhotoToAlbum(photo.id, uncertainAlbum.id)
      return
    }
    if (i % 6 === 5) {
      linkPhotoToAlbum(photo.id, commonAlbum.id)
      return
    }
    linkPhotoToAlbum(photo.id, personAlbums[i % personAlbums.length].id)
    // 매 4번째 사진은 다른 인물 앨범에도 연결(여러 아이 동반 촬영 = 다대다)
    if (i % 4 === 3) {
      linkPhotoToAlbum(photo.id, personAlbums[(i + 1) % personAlbums.length].id)
    }
  })

  // 커버 = 각 앨범의 첫 사진
  for (const album of albumsOfEvent(eventId)) {
    album.coverPhotoId = photosOfAlbum(album.id)[0]?.id ?? null
  }

  job.status = 'done'
  transitionEvent(eventId, 'review')
}
