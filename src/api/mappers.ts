/**
 * 실 BE 응답 ↔ MSW 목 응답(api-spec 평문) 이중 흡수 매퍼 (CHMO-192).
 *
 * BE는 리소스 필드명이 docs/api-spec.md와 다르다 — id가 `groupId`/`eventId`/`albumId`/
 * `photoId`/`userId`로 오고, `eventDate`(≠date)·`thumbnailUrl`(≠coverThumbnailUrl)·
 * `personName`(≠name)·대문자 enum(PUBLISHED 등)을 쓴다. 화면은 FE 도메인 타입
 * (src/types/api.ts)만 알도록 여기서만 변환한다. 도메인 모듈(auth/groups/events/albums/viewer)
 * 전용 내부 파일 — 화면에서 직접 import하지 않는다.
 *
 * MSW 목이 BE 형태로 이행(CHMO-195)하면 MSW 쪽 폴백(`?? raw.id` 등)을 걷어낸다.
 * BE DTO 정렬(CHMO-201)이 확정되면 해당 필드 매핑도 제거한다.
 */
import { SPECIAL_ALBUM_LABELS, UNNAMED_PERSON_LABEL } from '../lib/albumLabels'
import type {
  Album,
  AlbumType,
  EventItem,
  EventStatus,
  Group,
  ID,
  ISODate,
  ISODateTime,
  MoveSuggestion,
  Photo,
  PhotoFlags,
  User,
  ViewerAlbum,
  ViewerEvent,
  ViewerPhoto,
} from '../types/api'

// ── 공통 필드 폴백 (BE↔MSW 필드명 차이 — 이벤트·앨범 매퍼가 공유) ──
// BE가 필드명을 확정(CHMO-201)하면 이 헬퍼만 고치면 제작자·뷰어 매퍼가 함께 따라온다.

/** 커버 사진 id — BE thumbnailPhotoId | MSW coverPhotoId */
function coverPhotoIdOf(raw: { thumbnailPhotoId?: ID | null; coverPhotoId?: ID | null }): ID | null {
  return raw.thumbnailPhotoId ?? raw.coverPhotoId ?? null
}

/** 커버 썸네일 URL — BE thumbnailUrl | MSW coverThumbnailUrl */
function coverThumbnailUrlOf(raw: {
  thumbnailUrl?: string | null
  coverThumbnailUrl?: string | null
}): string | null {
  return raw.thumbnailUrl ?? raw.coverThumbnailUrl ?? null
}

/** 이벤트 날짜 — BE eventDate | MSW date */
function eventDateOf(raw: { eventDate?: ISODate; date?: ISODate }): ISODate {
  return (raw.eventDate ?? raw.date)!
}

// ── User ─────────────────────────────────────────────────────

/** BE UserProfileResponse(userId) | MSW User(id) */
export interface RawUser {
  userId?: ID
  id?: ID
  nickname: string
  createdAt: ISODateTime
}

export function toUser(raw: RawUser): User {
  return { id: (raw.userId ?? raw.id)!, nickname: raw.nickname, createdAt: raw.createdAt }
}

// ── Group ────────────────────────────────────────────────────

/** BE GroupSummaryResponse/GroupDetailResponse(groupId) | MSW Group(id) */
export interface RawGroup {
  groupId?: ID
  id?: ID
  name: string
  memberCount: number
  /** BE 상세(GroupDetailResponse)엔 없음 — 화면이 이벤트 목록 길이로 파생 */
  eventCount?: number
  share?: Group['share']
  createdAt: ISODateTime
}

export function toGroup(raw: RawGroup): Group {
  return {
    id: (raw.groupId ?? raw.id)!,
    name: raw.name,
    memberCount: raw.memberCount,
    eventCount: raw.eventCount,
    role: null,
    ...(raw.share ? { share: raw.share } : {}),
    createdAt: raw.createdAt,
  }
}

// ── Event ────────────────────────────────────────────────────

/** BE EventSummaryResponse/EventDetailResponse | MSW EventItem/ViewerEvent */
export interface RawEvent {
  eventId?: ID
  id?: ID
  groupId?: ID
  name: string
  /** BE는 eventDate, MSW는 date */
  eventDate?: ISODate
  date?: ISODate
  /** BE는 대문자(PUBLISHED), MSW는 소문자 */
  status?: string
  photoCount: number
  albumCount: number
  /** BE는 thumbnailPhotoId/thumbnailUrl, MSW는 coverPhotoId/coverThumbnailUrl */
  thumbnailPhotoId?: ID | null
  coverPhotoId?: ID | null
  thumbnailUrl?: string | null
  coverThumbnailUrl?: string | null
  createdAt?: ISODateTime
  publishedAt?: ISODateTime | null
}

export function toEvent(raw: RawEvent): EventItem {
  return {
    id: (raw.eventId ?? raw.id)!,
    groupId: raw.groupId,
    name: raw.name,
    date: eventDateOf(raw),
    status: (raw.status ?? 'empty').toLowerCase() as EventStatus,
    photoCount: raw.photoCount,
    albumCount: raw.albumCount,
    createdAt: raw.createdAt,
    publishedAt: raw.publishedAt ?? null,
    coverPhotoId: coverPhotoIdOf(raw),
  }
}

/** 뷰어 이벤트 목록 — BE는 제작자와 같은 EventSummaryResponse를 쓴다(CHMO-192 항목 9 선례) */
export function toViewerEvent(raw: RawEvent): ViewerEvent {
  return {
    id: (raw.eventId ?? raw.id)!,
    name: raw.name,
    date: eventDateOf(raw),
    photoCount: raw.photoCount,
    albumCount: raw.albumCount,
    coverPhotoId: coverPhotoIdOf(raw),
    coverThumbnailUrl: coverThumbnailUrlOf(raw),
    publishedAt: raw.publishedAt ?? null,
  }
}

// ── Album ────────────────────────────────────────────────────

/** BE AlbumSummaryResponse/AlbumDetailResponse | MSW Album/ViewerAlbum */
export interface RawAlbum {
  albumId?: ID
  id?: ID
  eventId?: ID
  /** BE는 대문자(EYES_CLOSED), MSW는 소문자 */
  type: string
  personId?: ID | null
  /** BE는 personName(특수 앨범 null), MSW는 표시명 name */
  personName?: string | null
  name?: string
  photoCount: number
  unreviewedPhotoCount?: number
  thumbnailPhotoId?: ID | null
  coverPhotoId?: ID | null
  thumbnailUrl?: string | null
  coverThumbnailUrl?: string | null
  visibleToViewer?: boolean
}

/** BE는 특수 앨범 표시명을 주지 않는다 — type에서 파생(라벨 원천 lib/albumLabels.ts) */
export function albumDisplayName(type: AlbumType, name: string | null | undefined): string {
  if (name) return name
  return type === 'person' ? UNNAMED_PERSON_LABEL : SPECIAL_ALBUM_LABELS[type]
}

export function toAlbum(raw: RawAlbum): Album {
  const type = raw.type.toLowerCase() as AlbumType
  return {
    id: (raw.albumId ?? raw.id)!,
    eventId: raw.eventId,
    type,
    personId: raw.personId ?? null,
    name: albumDisplayName(type, raw.name ?? raw.personName),
    photoCount: raw.photoCount,
    unreviewedPhotoCount: raw.unreviewedPhotoCount,
    coverPhotoId: coverPhotoIdOf(raw),
    coverThumbnailUrl: coverThumbnailUrlOf(raw),
    visibleToViewer: raw.visibleToViewer ?? (type === 'person' || type === 'common'),
  }
}

export function toViewerAlbum(raw: RawAlbum): ViewerAlbum {
  const type = raw.type.toLowerCase() as AlbumType
  return {
    id: (raw.albumId ?? raw.id)!,
    type,
    name: albumDisplayName(type, raw.name ?? raw.personName),
    photoCount: raw.photoCount,
    coverPhotoId: coverPhotoIdOf(raw),
    coverThumbnailUrl: coverThumbnailUrlOf(raw),
  }
}

// ── Photo ────────────────────────────────────────────────────

/** BE PhotoInAlbumResponse/ViewerPhotoResponse | MSW Photo/ViewerPhoto */
export interface RawPhoto {
  photoId?: ID
  id?: ID
  eventId?: ID
  albumIds?: ID[]
  /** BE엔 원본 url 필드가 없다 — downloadUrl이 원본 겸 다운로드 */
  url?: string
  downloadUrl?: string
  thumbnailUrl: string
  width?: number
  height?: number
  /** BE는 eyesClosed/blurry 평면 필드, MSW는 flags 객체 */
  flags?: PhotoFlags
  eyesClosed?: boolean
  blurry?: boolean
  reviewed?: boolean
  createdAt?: ISODateTime
}

export function toPhoto(raw: RawPhoto): Photo {
  return {
    id: (raw.photoId ?? raw.id)!,
    eventId: raw.eventId,
    albumIds: raw.albumIds ?? [],
    url: (raw.url ?? raw.downloadUrl)!,
    thumbnailUrl: raw.thumbnailUrl,
    width: raw.width,
    height: raw.height,
    flags: raw.flags ?? { eyesClosed: raw.eyesClosed ?? false, blurry: raw.blurry ?? false },
    reviewed: raw.reviewed ?? false,
    downloadUrl: raw.downloadUrl ?? raw.url,
    createdAt: raw.createdAt,
  }
}

export function toViewerPhoto(raw: RawPhoto): ViewerPhoto {
  const download = (raw.downloadUrl ?? raw.url)!
  return {
    id: (raw.photoId ?? raw.id)!,
    url: raw.url ?? download,
    thumbnailUrl: raw.thumbnailUrl,
    downloadUrl: download,
  }
}

// ── 이동 추천 ────────────────────────────────────────────────

/** BE MoveSuggestionResponse(personName) | MSW MoveSuggestion(name) — 공통 앨범은 이름 없이 온다 */
export interface RawMoveSuggestion {
  albumId: ID
  name?: string
  personName?: string | null
  similarity?: number | null
}

export function toMoveSuggestion(raw: RawMoveSuggestion): MoveSuggestion {
  return {
    albumId: raw.albumId,
    name: raw.name ?? raw.personName ?? SPECIAL_ALBUM_LABELS.common,
    similarity: raw.similarity ?? null,
  }
}
