/**
 * 학부모 뷰어(무로그인) 엔드포인트 (CHMO-192) — 잠금 해제·15-L·15·16.
 * BE는 모임명을 unlock 응답(groupName)에만 주고 목록(GET /share/:token)은 bare
 * EventSummaryResponse[]다 — 모임명은 lib/viewer.ts에 캐시해 두고 목록 화면이 쓴다.
 * 뷰어 앨범은 제작자와 같은 AlbumSummaryResponse로 내려온다(항목 9).
 */
import { apiFetch } from './client'
import {
  albumDisplayName,
  toViewerAlbum,
  toViewerEvent,
  toViewerPhoto,
  type RawAlbum,
  type RawEvent,
  type RawPhoto,
} from './mappers'
import { getViewerGroupName, setViewerGroupName } from '../lib/viewer'
import type {
  AlbumDownloadResponse,
  AlbumType,
  ID,
  ViewerAlbum,
  ViewerEvent,
  ViewerPhoto,
  ViewerUnlockResponse,
} from '../types/api'

interface RawUnlock {
  viewerToken: string
  groupId?: ID
  groupName?: string
  /** MSW 옛 계약 — 목 이행(CHMO-195)까지 흡수 */
  group?: { id: ID; name: string }
}

/** POST /share/:token/unlock — 학부모 전용 비밀번호 확인 → viewerToken 발급 */
export async function unlockViewer(
  shareToken: string,
  password: string,
): Promise<ViewerUnlockResponse> {
  const raw = await apiFetch<RawUnlock>(`/share/${shareToken}/unlock`, {
    method: 'POST',
    auth: 'none',
    body: { password },
  })
  return {
    viewerToken: raw.viewerToken,
    groupId: (raw.groupId ?? raw.group?.id)!,
    groupName: raw.groupName ?? raw.group?.name ?? '',
  }
}

export interface ViewerEventsResult {
  groupName: string
  events: ViewerEvent[]
}

/**
 * GET /share/:token — 공개된 이벤트 목록(15-L, published만 서버 필터).
 * BE 응답엔 모임명이 없어 unlock 때 캐시한 이름을 쓴다(MSW 응답이 주면 캐시도 갱신).
 */
export function getViewerEvents(
  shareToken: string,
  signal?: AbortSignal,
): Promise<ViewerEventsResult> {
  return apiFetch<RawEvent[] | { group: { id: ID; name: string }; events: RawEvent[] }>(
    `/share/${shareToken}`,
    { auth: 'viewer', viewerShareToken: shareToken, signal },
  ).then((raw) => {
    if (Array.isArray(raw))
      return { groupName: getViewerGroupName(shareToken) ?? '', events: raw.map(toViewerEvent) }
    setViewerGroupName(shareToken, raw.group.name)
    return { groupName: raw.group.name, events: raw.events.map(toViewerEvent) }
  })
}

export interface ViewerAlbumsResult {
  eventName: string
  albums: ViewerAlbum[]
}

/** GET /share/:token/events/:eventId — 공개 이벤트의 앨범 목록(15, person/common만 서버 필터) */
export function getViewerAlbums(
  shareToken: string,
  eventId: ID | string,
  signal?: AbortSignal,
): Promise<ViewerAlbumsResult> {
  return apiFetch<
    | { event: { id: ID; name: string }; albums: RawAlbum[] }
    | { eventId: ID; eventName: string; albums: RawAlbum[] }
  >(`/share/${shareToken}/events/${eventId}`, {
    auth: 'viewer',
    viewerShareToken: shareToken,
    signal,
  }).then((raw) => ({
    eventName: 'event' in raw ? raw.event.name : raw.eventName,
    albums: raw.albums.map(toViewerAlbum),
  }))
}

export interface ViewerAlbumPhotosResult {
  album: { id: ID; name: string; photoCount: number }
  photos: ViewerPhoto[]
}

/** BE ViewerAlbumPhotosResponse — type 없이 personName만 온다(특수 앨범 null → 라벨 파생) */
interface RawViewerAlbumPhotos {
  album?: { id: ID; name: string; photoCount: number }
  albumId?: ID
  personName?: string | null
  type?: string
  photos: RawPhoto[]
}

/** GET /share/:token/events/:eventId/albums/:albumId — 앨범 사진 그리드(16, 검토 완료만 서버 필터) */
export function getViewerAlbumPhotos(
  shareToken: string,
  eventId: ID | string,
  albumId: ID | string,
  signal?: AbortSignal,
): Promise<ViewerAlbumPhotosResult> {
  return apiFetch<RawViewerAlbumPhotos>(
    `/share/${shareToken}/events/${eventId}/albums/${albumId}`,
    { auth: 'viewer', viewerShareToken: shareToken, signal },
  ).then((raw) => {
    const photos = raw.photos.map(toViewerPhoto)
    const album = raw.album ?? {
      id: raw.albumId!,
      // 뷰어 노출 앨범은 person/common뿐 — personName이 없으면 공통 앨범이다
      name: albumDisplayName((raw.type?.toLowerCase() as AlbumType) ?? 'common', raw.personName),
      photoCount: photos.length,
    }
    return { album, photos }
  })
}

/** GET …/albums/:albumId/download — 일괄 zip 다운로드 URL 발급(16) */
export function getViewerAlbumZip(
  shareToken: string,
  eventId: ID | string,
  albumId: ID | string,
): Promise<AlbumDownloadResponse> {
  return apiFetch<AlbumDownloadResponse>(
    `/share/${shareToken}/events/${eventId}/albums/${albumId}/download`,
    { auth: 'viewer', viewerShareToken: shareToken },
  )
}
