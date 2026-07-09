/**
 * DB 레코드 → API 응답 스키마 직렬화 (docs/api-spec.md §2).
 * pin·모임 비밀번호·학부모 비밀번호 평문은 여기서 절대 노출하지 않는다
 * (평문은 invite/share 전용 핸들러만 반환).
 */
import type {
  Album,
  AlbumType,
  EventItem,
  Group,
  Photo,
  User,
  ViewerAlbum,
  ViewerEvent,
  ViewerPhoto,
} from '../../types/api'
import {
  albumCountOf,
  albumName,
  albumsOfEvent,
  eventCountOf,
  findPhoto,
  memberCountOf,
  photoCountOfAlbum,
  photoCountOfEvent,
  reviewedPhotosOfAlbum,
  unreviewedCountOfAlbum,
  type DbAlbum,
  type DbEvent,
  type DbGroup,
  type DbPhoto,
  type DbUser,
} from '../db'

export function toUser(user: DbUser): User {
  return { id: user.id, nickname: user.nickname, createdAt: user.createdAt }
}

export function shareUrlOf(group: DbGroup): string {
  return `${window.location.origin}/share/${group.share.token}`
}

export function joinUrlOf(group: DbGroup): string {
  return `${window.location.origin}/join/${group.joinKey}`
}

/** 목록 응답은 share 생략(스펙 예시와 동일), 상세 응답은 includeShare로 포함 */
export function toGroup(group: DbGroup, opts: { includeShare?: boolean } = {}): Group {
  return {
    id: group.id,
    name: group.name,
    memberCount: memberCountOf(group.id),
    eventCount: eventCountOf(group.id),
    joinKey: group.joinKey,
    role: null,
    ...(opts.includeShare
      ? { share: { token: group.share.token, url: shareUrlOf(group), hasPassword: true } }
      : {}),
    createdAt: group.createdAt,
  }
}

export function toEvent(event: DbEvent): EventItem {
  return {
    id: event.id,
    groupId: event.groupId,
    name: event.name,
    date: event.date,
    status: event.status,
    photoCount: photoCountOfEvent(event.id),
    albumCount: albumCountOf(event.id),
    createdAt: event.createdAt,
    publishedAt: event.publishedAt,
  }
}

// ── 사진 URL (DB는 메타만 보유 — id 시드 기반 결정적 목 이미지) ──

/** picsum 시드 URL — MSW가 가로채지 않는 외부 요청이라 실제 이미지가 렌더된다 */
export function photoUrlOf(photo: DbPhoto): string {
  return `https://picsum.photos/seed/${photo.id}/${photo.width}/${photo.height}`
}

export function photoThumbnailUrlOf(photo: DbPhoto): string {
  // 정수 경로 세그먼트만 유효(picsum) — 4의 배수가 아닌 치수가 들어와도 소수점이 새지 않게 반올림
  const w = Math.round(photo.width / 4)
  const h = Math.round(photo.height / 4)
  return `https://picsum.photos/seed/${photo.id}/${w}/${h}`
}

export function toPhoto(photo: DbPhoto): Photo {
  return {
    id: photo.id,
    eventId: photo.eventId,
    albumIds: [...photo.albumIds],
    url: photoUrlOf(photo),
    thumbnailUrl: photoThumbnailUrlOf(photo),
    width: photo.width,
    height: photo.height,
    flags: { ...photo.flags },
    reviewed: photo.reviewed,
    createdAt: photo.createdAt,
  }
}

// ── 앨범 ─────────────────────────────────────────────────────

/** 그리드 표시 순서: 인물 → 공통 → 분류어려움 → 눈감음 → 흔들림 (같은 타입은 생성 순 유지) */
const ALBUM_TYPE_ORDER: Record<AlbumType, number> = {
  person: 0,
  common: 1,
  uncertain: 2,
  eyes_closed: 3,
  blurry: 4,
}

export function albumsOfEventSorted(eventId: number): DbAlbum[] {
  return albumsOfEvent(eventId)
    .slice()
    .sort((a, b) => ALBUM_TYPE_ORDER[a.type] - ALBUM_TYPE_ORDER[b.type])
}

/** 학부모 뷰어 노출 대상 타입(person/common) — 특수 앨범은 제작자 화면 전용 */
export function isViewerVisibleType(album: DbAlbum): boolean {
  return album.type === 'person' || album.type === 'common'
}

export function toAlbum(album: DbAlbum): Album {
  const cover = album.coverPhotoId ? findPhoto(album.coverPhotoId) : undefined
  return {
    id: album.id,
    eventId: album.eventId,
    type: album.type,
    personId: album.personId,
    name: albumName(album),
    photoCount: photoCountOfAlbum(album.id),
    unreviewedPhotoCount: unreviewedCountOfAlbum(album.id),
    coverPhotoId: album.coverPhotoId,
    coverThumbnailUrl: cover ? photoThumbnailUrlOf(cover) : null,
    visibleToViewer: isViewerVisibleType(album),
  }
}

// ── 뷰어 직렬화 (서버 필터링 책임 — 검토 완료 사진만 반영) ────

/**
 * 뷰어에 노출되는 앨범 = person/common 이면서 검토 완료 사진이 1장 이상.
 * (공개 후 추가된 미검토 사진뿐인 앨범은 빈 카드가 되므로 목록에서 제외)
 */
export function viewerAlbumsOfEvent(eventId: number): DbAlbum[] {
  return albumsOfEventSorted(eventId).filter(
    (a) => isViewerVisibleType(a) && reviewedPhotosOfAlbum(a.id).length > 0,
  )
}

/** 뷰어 카운트·커버는 검토 완료 사진 기준(커버가 미검토면 첫 검토 사진으로 대체) */
export function toViewerAlbum(album: DbAlbum): ViewerAlbum {
  const reviewed = reviewedPhotosOfAlbum(album.id)
  const cover = reviewed.find((p) => p.id === album.coverPhotoId) ?? reviewed[0] ?? null
  return {
    id: album.id,
    type: album.type,
    name: albumName(album),
    photoCount: reviewed.length,
    coverPhotoId: cover?.id ?? null,
    coverThumbnailUrl: cover ? photoThumbnailUrlOf(cover) : null,
  }
}

export function toViewerPhoto(photo: DbPhoto): ViewerPhoto {
  return {
    id: photo.id,
    url: photoUrlOf(photo),
    thumbnailUrl: photoThumbnailUrlOf(photo),
    downloadUrl: photoUrlOf(photo),
  }
}

export function toViewerEvent(event: DbEvent): ViewerEvent {
  const albums = viewerAlbumsOfEvent(event.id)
  const photoIds = new Set<number>()
  for (const album of albums) {
    for (const photo of reviewedPhotosOfAlbum(album.id)) photoIds.add(photo.id)
  }
  const coverAlbum = albums[0] ? toViewerAlbum(albums[0]) : null
  return {
    id: event.id,
    name: event.name,
    date: event.date,
    photoCount: photoIds.size,
    albumCount: albums.length,
    coverPhotoId: coverAlbum?.coverPhotoId ?? null,
    coverThumbnailUrl: coverAlbum?.coverThumbnailUrl ?? null,
    publishedAt: event.publishedAt,
  }
}
