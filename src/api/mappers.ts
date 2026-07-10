/**
 * 실 BE 응답 → FE 도메인 타입 매퍼 (CHMO-192 · 목 이행 CHMO-195).
 *
 * BE는 리소스 필드명이 docs/api-spec.md와 다르다 — id가 `groupId`/`eventId`/`albumId`/
 * `photoId`/`userId`로 오고, `eventDate`(≠date)·`thumbnailUrl`(≠coverThumbnailUrl)·
 * `personName`(≠표시명)·대문자 enum(PUBLISHED 등)을 쓴다. 화면은 FE 도메인 타입
 * (src/types/api.ts)만 알도록 여기서만 변환한다. 도메인 모듈(auth/groups/events/albums/viewer)
 * 전용 내부 파일 — 화면에서 직접 import하지 않는다.
 *
 * MSW 목도 이 형태로 응답한다(CHMO-195) — 이중 흡수 폴백은 없다.
 * BE DTO 정렬(CHMO-201)이 확정되면 해당 필드 매핑을 제거한다.
 *
 * 응답에 없는 필드는 **BE가 주지 않는다는 뜻**이다(누락이 아니라 계약):
 * 이벤트 목록엔 groupId·publishedAt이 없고, 앨범 상세엔 thumbnail*·unreviewedPhotoCount가 없다.
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
  User,
  ViewerAlbum,
  ViewerEvent,
  ViewerPhoto,
} from '../types/api'

// ── User ─────────────────────────────────────────────────────

/** BE UserProfileResponse */
export interface RawUser {
  userId: ID
  nickname: string
  createdAt: ISODateTime
}

export function toUser(raw: RawUser): User {
  return { id: raw.userId, nickname: raw.nickname, createdAt: raw.createdAt }
}

// ── Group ────────────────────────────────────────────────────

/** BE GroupSummaryResponse/GroupDetailResponse */
export interface RawGroup {
  groupId: ID
  name: string
  memberCount: number
  /** BE 상세(GroupDetailResponse)엔 없음 — 화면이 이벤트 목록 길이로 파생 */
  eventCount?: number
  createdAt: ISODateTime
}

export function toGroup(raw: RawGroup): Group {
  return {
    id: raw.groupId,
    name: raw.name,
    memberCount: raw.memberCount,
    eventCount: raw.eventCount,
    role: null,
    createdAt: raw.createdAt,
  }
}

// ── Event ────────────────────────────────────────────────────

/** BE EventSummaryResponse(thumbnailUrl 보유) | EventDetailResponse(groupId·publishedAt 보유) */
export interface RawEvent {
  eventId: ID
  /** 상세에만 */
  groupId?: ID
  name: string
  /** 대문자 enum(EMPTY/ANALYZING/REVIEW/READY/PUBLISHED) */
  status: string
  eventDate: ISODate
  photoCount: number
  albumCount: number
  thumbnailPhotoId?: ID | null
  /** 목록에만 */
  thumbnailUrl?: string | null
  /** 상세에만 */
  publishedAt?: ISODateTime | null
  createdAt?: ISODateTime
}

export function toEvent(raw: RawEvent): EventItem {
  return {
    id: raw.eventId,
    groupId: raw.groupId,
    name: raw.name,
    date: raw.eventDate,
    status: raw.status.toLowerCase() as EventStatus,
    photoCount: raw.photoCount,
    albumCount: raw.albumCount,
    createdAt: raw.createdAt,
    publishedAt: raw.publishedAt ?? null,
    coverPhotoId: raw.thumbnailPhotoId ?? null,
  }
}

/** 뷰어 이벤트 목록 — BE는 제작자와 같은 EventSummaryResponse를 쓴다(CHMO-192 항목 9 선례) */
export function toViewerEvent(raw: RawEvent): ViewerEvent {
  return {
    id: raw.eventId,
    name: raw.name,
    date: raw.eventDate,
    photoCount: raw.photoCount,
    albumCount: raw.albumCount,
    coverPhotoId: raw.thumbnailPhotoId ?? null,
    coverThumbnailUrl: raw.thumbnailUrl ?? null,
    publishedAt: raw.publishedAt ?? null,
  }
}

// ── Album ────────────────────────────────────────────────────

/** BE AlbumSummaryResponse | AlbumDetailResponse(thumbnail*·unreviewedPhotoCount 없음) */
export interface RawAlbum {
  albumId: ID
  /** 대문자 enum(PERSON/COMMON/UNCERTAIN/EYES_CLOSED/BLURRY) */
  type: string
  personId: ID | null
  /** 인물 앨범만 값 보유 — 특수 앨범은 null(표시명은 FE가 type에서 파생) */
  personName: string | null
  photoCount: number
  unreviewedPhotoCount?: number
  thumbnailPhotoId?: ID | null
  thumbnailUrl?: string | null
}

/** BE는 특수 앨범 표시명을 주지 않는다 — type에서 파생(라벨 원천 lib/albumLabels.ts) */
export function albumDisplayName(type: AlbumType, personName: string | null | undefined): string {
  if (personName) return personName
  return type === 'person' ? UNNAMED_PERSON_LABEL : SPECIAL_ALBUM_LABELS[type]
}

export function toAlbum(raw: RawAlbum): Album {
  const type = raw.type.toLowerCase() as AlbumType
  return {
    id: raw.albumId,
    type,
    personId: raw.personId,
    name: albumDisplayName(type, raw.personName),
    photoCount: raw.photoCount,
    unreviewedPhotoCount: raw.unreviewedPhotoCount,
    coverPhotoId: raw.thumbnailPhotoId ?? null,
    coverThumbnailUrl: raw.thumbnailUrl ?? null,
    // 뷰어 노출 여부도 BE엔 없다 — person/common만 true로 파생
    visibleToViewer: type === 'person' || type === 'common',
  }
}

export function toViewerAlbum(raw: RawAlbum): ViewerAlbum {
  const type = raw.type.toLowerCase() as AlbumType
  return {
    id: raw.albumId,
    type,
    name: albumDisplayName(type, raw.personName),
    photoCount: raw.photoCount,
    coverPhotoId: raw.thumbnailPhotoId ?? null,
    coverThumbnailUrl: raw.thumbnailUrl ?? null,
  }
}

// ── Photo ────────────────────────────────────────────────────

/** BE PhotoInAlbumResponse — 원본 url 필드가 없다(downloadUrl이 원본 겸 다운로드) */
export interface RawPhoto {
  photoId: ID
  s3Key?: string
  thumbnailUrl: string
  downloadUrl: string
  eyesClosed?: boolean
  blurry?: boolean
  reviewed?: boolean
  albumIds?: ID[]
}

export function toPhoto(raw: RawPhoto): Photo {
  return {
    id: raw.photoId,
    albumIds: raw.albumIds ?? [],
    url: raw.downloadUrl,
    thumbnailUrl: raw.thumbnailUrl,
    flags: { eyesClosed: raw.eyesClosed ?? false, blurry: raw.blurry ?? false },
    reviewed: raw.reviewed ?? false,
    downloadUrl: raw.downloadUrl,
  }
}

/** BE ViewerPhotoResponse — 검토 완료 사진만 내려온다(서버 필터링) */
export interface RawViewerPhoto {
  photoId: ID
  thumbnailUrl: string
  downloadUrl: string
}

export function toViewerPhoto(raw: RawViewerPhoto): ViewerPhoto {
  return {
    id: raw.photoId,
    url: raw.downloadUrl,
    thumbnailUrl: raw.thumbnailUrl,
    downloadUrl: raw.downloadUrl,
  }
}

// ── 이동 추천 ────────────────────────────────────────────────

/** BE MoveSuggestionResponse — 공통 앨범은 이름도 유사도도 없이 온다 */
export interface RawMoveSuggestion {
  albumId: ID
  personName: string | null
  similarity: number | null
}

export function toMoveSuggestion(raw: RawMoveSuggestion): MoveSuggestion {
  return {
    albumId: raw.albumId,
    name: raw.personName ?? SPECIAL_ALBUM_LABELS.common,
    similarity: raw.similarity,
  }
}
