/**
 * DB 레코드 → **실 BE 응답 DTO** 직렬화 (CHMO-195).
 *
 * 함수 이름은 BE DTO를 따른다(GroupSummaryResponse → toGroupSummary …). 목록/상세가
 * 서로 다른 필드를 주는 것까지 BE 그대로다 — 예: 이벤트 목록엔 thumbnailUrl이 있고
 * groupId·publishedAt이 없다. 표시명('공통' 등)·flags 객체 같은 FE 계약 형태는 만들지 않는다
 * (예외: MoveSuggestionResponse는 실 BE가 personName에 '공통'을 직접 준다 — CHMO-399 관찰).
 * 변환은 `src/api/mappers.ts`가 한다.
 *
 * pin·모임 비밀번호·학부모 비밀번호 평문은 여기서 절대 노출하지 않는다
 * (평문은 invite/share 전용 핸들러만 반환).
 */
import { SPECIAL_ALBUM_LABELS } from '../../lib/albumLabels'
import type { AlbumType } from '../../types/api'
import {
  albumCountOf,
  albumsOfEvent,
  eventCountOf,
  findPhoto,
  memberCountOf,
  personNameOf,
  photoCountOfAlbum,
  photoCountOfEvent,
  photosOfAlbum,
  photosOfEvent,
  progressOf,
  reviewedPhotosOfAlbum,
  unreviewedCountOfAlbum,
  type DbAlbum,
  type DbEvent,
  type DbGroup,
  type DbPhoto,
  type DbUser,
} from '../db'

/** BE UserProfileResponse — id가 아니라 userId */
export function toUser(user: DbUser) {
  return { userId: user.id, nickname: user.nickname, createdAt: user.createdAt }
}

export function shareUrlOf(group: DbGroup): string {
  return `${window.location.origin}/share/${group.share.token}`
}

/**
 * 실 BE 계약(CHMO-237): joinUrl은 **쿼리형**(`/join?joinKey=…`)이라 FE 라우트(`/join/:joinKey`)와
 * 안 맞는다 — 화면이 이 값을 그대로 쓰면 목에서도 404가 나게 그대로 흉내 낸다.
 * FE는 이 값을 버리고 joinKey로 경로형을 파생한다(`src/api/groups.ts`).
 */
export function joinUrlOf(group: DbGroup): string {
  return `${window.location.origin}/join?joinKey=${group.joinKey}`
}

// ── 모임 ─────────────────────────────────────────────────────
// joinKey·비밀번호·공유 토큰은 응답에 없다 — 시크릿은 invite/share 전용 핸들러만 반환한다.

/** BE GroupSummaryResponse — 목록 전용(eventCount 포함) */
export function toGroupSummary(group: DbGroup) {
  return {
    groupId: group.id,
    name: group.name,
    memberCount: memberCountOf(group.id),
    eventCount: eventCountOf(group.id),
    createdAt: group.createdAt,
  }
}

/** BE GroupDetailResponse — 상세엔 **eventCount가 없다**(화면이 이벤트 목록 길이로 파생) */
export function toGroupDetail(group: DbGroup) {
  return {
    groupId: group.id,
    name: group.name,
    memberCount: memberCountOf(group.id),
    createdAt: group.createdAt,
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

// ── 이벤트 ───────────────────────────────────────────────────

/** 이벤트 커버 = 등록된 첫 사진(BE thumbnailPhotoId의 목 대응물) */
function eventCoverOf(eventId: number): DbPhoto | undefined {
  return photosOfEvent(eventId)[0]
}

/** BE EventSummaryResponse — 목록 전용. thumbnailUrl이 있고 groupId·publishedAt은 없다 */
export function toEventSummary(event: DbEvent) {
  const cover = eventCoverOf(event.id)
  return {
    eventId: event.id,
    name: event.name,
    status: event.status.toUpperCase(),
    eventDate: event.date,
    thumbnailPhotoId: cover?.id ?? null,
    thumbnailUrl: cover ? photoThumbnailUrlOf(cover) : null,
    photoCount: photoCountOfEvent(event.id),
    albumCount: albumCountOf(event.id),
    createdAt: event.createdAt,
  }
}

/** BE EventDetailResponse — groupId·publishedAt이 있고 **thumbnailUrl은 없다** */
export function toEventDetail(event: DbEvent) {
  const cover = eventCoverOf(event.id)
  return {
    eventId: event.id,
    groupId: event.groupId,
    name: event.name,
    status: event.status.toUpperCase(),
    eventDate: event.date,
    thumbnailPhotoId: cover?.id ?? null,
    photoCount: photoCountOfEvent(event.id),
    albumCount: albumCountOf(event.id),
    publishedAt: event.publishedAt,
    createdAt: event.createdAt,
    // AI 분석 진행률(CHMO-287) — 상세 전용, 분석 중에만 non-null(목록엔 BE도 안 준다)
    progress: progressOf(event.id),
  }
}

/**
 * BE AnalysisStatusResponse — 분석 상태(GET /events/:id/analysis).
 * 두 필드 모두 대문자 enum이다(다른 이벤트 직렬화와 동일). analysisStatus는 이벤트
 * 상태에서 유도한다: EMPTY→NONE · ANALYZING→ANALYZING · 그 외→DONE(BE와 동일).
 */
export function toAnalysisStatusResponse(event: DbEvent) {
  const analysisStatus =
    event.status === 'empty' ? 'NONE' : event.status === 'analyzing' ? 'ANALYZING' : 'DONE'
  return { analysisStatus, eventStatus: event.status.toUpperCase() }
}

// ── 사진 ─────────────────────────────────────────────────────

/** BE PhotoInAlbumResponse — 원본 url·치수 없이 downloadUrl, 플래그는 평면 필드 */
export function toPhotoInAlbum(photo: DbPhoto) {
  return {
    photoId: photo.id,
    s3Key: photo.s3Key,
    thumbnailUrl: photoThumbnailUrlOf(photo),
    downloadUrl: photoUrlOf(photo),
    blurry: photo.flags.blurry,
    eyesClosed: photo.flags.eyesClosed,
    reviewed: photo.reviewed,
    albumIds: [...photo.albumIds],
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

/** BE reviewStatus — 앨범엔 검토 상태가 없다(사진 단위 reviewed의 파생값). 빈 앨범은 미검토 */
function reviewStatusOf(albumId: number, photoCount: number): 'REVIEWED' | 'UNREVIEWED' {
  return photoCount > 0 && unreviewedCountOfAlbum(albumId) === 0 ? 'REVIEWED' : 'UNREVIEWED'
}

/** BE AlbumSummaryResponse — 대문자 type, 표시명 대신 personName(특수 앨범은 null) */
export function toAlbumSummary(album: DbAlbum) {
  const cover = album.coverPhotoId ? findPhoto(album.coverPhotoId) : undefined
  const photoCount = photoCountOfAlbum(album.id)
  return {
    albumId: album.id,
    type: album.type.toUpperCase(),
    personName: personNameOf(album),
    personId: album.personId,
    photoCount,
    unreviewedPhotoCount: unreviewedCountOfAlbum(album.id),
    thumbnailPhotoId: cover?.id ?? null,
    thumbnailUrl: cover ? photoThumbnailUrlOf(cover) : null,
    reviewStatus: reviewStatusOf(album.id, photoCount),
  }
}

/** BE AlbumDetailResponse — photos를 내장하고 thumbnail*·unreviewedPhotoCount·eventId가 없다 */
export function toAlbumDetail(album: DbAlbum) {
  const photos = photosOfAlbum(album.id)
  return {
    albumId: album.id,
    type: album.type.toUpperCase(),
    personName: personNameOf(album),
    personId: album.personId,
    photoCount: photos.length,
    reviewStatus: reviewStatusOf(album.id, photos.length),
    photos: photos.map(toPhotoInAlbum),
  }
}

// ── 공개 요약 (화면 14) ──────────────────────────────────────

/**
 * BE ReviewSummaryResponse — 공개 요약(14). 미리보기 전용 필드는 없다
 * (미리보기 앨범은 화면이 albums[]에서 파생 — CHMO-346). 앨범 검토 상태는 사진 단위 reviewed의 파생값
 * (빈 앨범은 미검토). 호출부는 settleAnalysis를 마친 event를 넘긴다.
 */
export function toReviewSummaryResponse(event: DbEvent) {
  const photos = photosOfEvent(event.id)
  const albums = albumsOfEvent(event.id)
  const uncertainAlbum = albums.find((a) => a.type === 'uncertain')
  const reviewedAlbums = albums.filter(
    (a) => photoCountOfAlbum(a.id) > 0 && unreviewedCountOfAlbum(a.id) === 0,
  ).length
  return {
    eventId: event.id,
    eventStatus: event.status.toUpperCase(),
    totalAlbums: albums.length,
    reviewedAlbums,
    unreviewedAlbums: albums.length - reviewedAlbums,
    totalPhotos: photos.length,
    reviewedPhotoCount: photos.filter((p) => p.reviewed).length,
    uncertainCount: uncertainAlbum ? photoCountOfAlbum(uncertainAlbum.id) : 0,
    albums: albumsOfEventSorted(event.id).map(toAlbumSummary),
  }
}

// ── 사진 이동/제거 응답 (화면 09·09-1) ───────────────────────

/**
 * BE MoveSuggestionResponse 항목 — 앨범 목록 DTO와 달리 type이 실재하고 공통 앨범은
 * personName을 '공통'으로 채워 준다(2026-07-22 실서버 관찰, CHMO-399). thumbnailUrl은 CHMO-232
 */
export function toMoveSuggestionResponse(album: DbAlbum, similarity: number | null) {
  const cover = album.coverPhotoId ? findPhoto(album.coverPhotoId) : undefined
  return {
    albumId: album.id,
    type: album.type.toUpperCase(),
    personName:
      personNameOf(album) ?? (album.type === 'common' ? SPECIAL_ALBUM_LABELS.common : null),
    similarity,
    thumbnailUrl: cover ? photoThumbnailUrlOf(cover) : null,
  }
}

/** BE MovePhotosResponse — 이동 완료 건수 */
export function toMovePhotosResponse(photoIds: number[]) {
  return { movedCount: photoIds.length }
}

/**
 * BE DeletePhotosResponse — 연결만 해제된 사진과 마지막 연결이라 폐기된 사진을 구분한다.
 * (removePhotoFromAlbum이 마지막 연결이면 레코드를 지운다 → findPhoto가 undefined)
 * 호출부가 removePhotoFromAlbum을 마친 뒤의 photoIds를 넘긴다.
 */
export function toDeletePhotosResponse(photoIds: number[]) {
  return {
    detachedCount: photoIds.length,
    deletedPhotoCount: photoIds.filter((id) => !findPhoto(id)).length,
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

/**
 * 뷰어 앨범 — BE는 제작자와 같은 AlbumSummaryResponse를 쓴다.
 * 카운트·커버는 검토 완료 사진 기준(커버가 미검토면 첫 검토 사진으로 대체).
 */
export function toViewerAlbumSummary(album: DbAlbum) {
  const reviewed = reviewedPhotosOfAlbum(album.id)
  const cover = reviewed.find((p) => p.id === album.coverPhotoId) ?? reviewed[0] ?? null
  return {
    albumId: album.id,
    type: album.type.toUpperCase(),
    personName: personNameOf(album),
    personId: album.personId,
    photoCount: reviewed.length,
    // 뷰어엔 검토 완료 사진만 내려간다 — 미검토는 존재 자체가 노출되지 않는다
    unreviewedPhotoCount: 0,
    thumbnailPhotoId: cover?.id ?? null,
    thumbnailUrl: cover ? photoThumbnailUrlOf(cover) : null,
    reviewStatus: 'REVIEWED' as const,
  }
}

/** BE ViewerPhotoResponse — 원본 url이 없다(downloadUrl이 원본 겸 다운로드) */
export function toViewerPhoto(photo: DbPhoto) {
  return {
    photoId: photo.id,
    thumbnailUrl: photoThumbnailUrlOf(photo),
    downloadUrl: photoUrlOf(photo),
  }
}

/** BE UnlockViewerResponse — 모임명은 이 응답에만 온다(목록 GET /share/:token은 bare 배열) */
export function toViewerUnlockResponse(group: DbGroup, viewerToken: string) {
  return { viewerToken, groupId: group.id, groupName: group.name }
}

/** BE ViewerEventAlbumsResponse — eventId·eventName이 평면 필드다(person/common만 노출) */
export function toViewerEventAlbumsResponse(event: DbEvent) {
  return {
    eventId: event.id,
    eventName: event.name,
    albums: viewerAlbumsOfEvent(event.id).map(toViewerAlbumSummary),
  }
}

/** BE ViewerAlbumPhotosResponse — type·photoCount 없이 personName만 온다(공통 앨범은 null) */
export function toViewerAlbumPhotosResponse(album: DbAlbum) {
  return {
    albumId: album.id,
    personName: personNameOf(album),
    photos: reviewedPhotosOfAlbum(album.id).map(toViewerPhoto),
  }
}

/** 뷰어 이벤트 목록 — BE는 제작자와 같은 EventSummaryResponse를 쓴다(카운트·커버만 검토 완료 기준) */
export function toViewerEventSummary(event: DbEvent) {
  const albums = viewerAlbumsOfEvent(event.id)
  const photoIds = new Set<number>()
  for (const album of albums) {
    for (const photo of reviewedPhotosOfAlbum(album.id)) photoIds.add(photo.id)
  }
  const cover = albums[0] ? toViewerAlbumSummary(albums[0]) : null
  return {
    eventId: event.id,
    name: event.name,
    status: event.status.toUpperCase(),
    eventDate: event.date,
    thumbnailPhotoId: cover?.thumbnailPhotoId ?? null,
    thumbnailUrl: cover?.thumbnailUrl ?? null,
    photoCount: photoIds.size,
    albumCount: albums.length,
    createdAt: event.createdAt,
  }
}
