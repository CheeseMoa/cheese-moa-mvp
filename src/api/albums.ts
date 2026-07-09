/**
 * 앨범·사진 엔드포인트 (CHMO-192) — 09 앨범 상세(선택/삭제/검토)·09-1 옮기기.
 * BE AlbumDetailResponse는 photos를 내장하고({album, photos} 래핑 없음),
 * 검토 완료는 reviewStatus enum으로 받는다 — 차이는 전부 여기서 흡수.
 */
import { apiFetch, unwrapList } from './client'
import {
  toAlbum,
  toMoveSuggestion,
  toPhoto,
  type RawAlbum,
  type RawMoveSuggestion,
  type RawPhoto,
} from './mappers'
import type {
  Album,
  DeletePhotosResponse,
  ID,
  MovePhotosResponse,
  MoveSuggestion,
  Photo,
} from '../types/api'

export interface AlbumWithPhotos {
  album: Album
  photos: Photo[]
}

/** MSW는 {album, photos} 래핑, BE는 AlbumDetailResponse에 photos 내장 */
type RawAlbumDetail = { album: RawAlbum; photos: RawPhoto[] } | (RawAlbum & { photos?: RawPhoto[] })

/** GET /albums/:id — 앨범 상세(사진 포함) */
export function getAlbumWithPhotos(
  albumId: ID | string,
  signal?: AbortSignal,
): Promise<AlbumWithPhotos> {
  return apiFetch<RawAlbumDetail>(`/albums/${albumId}`, { signal }).then((raw) => {
    if ('album' in raw && raw.album)
      return { album: toAlbum(raw.album), photos: raw.photos?.map(toPhoto) ?? [] }
    const detail = raw as RawAlbum & { photos?: RawPhoto[] }
    return { album: toAlbum(detail), photos: detail.photos?.map(toPhoto) ?? [] }
  })
}

/**
 * PATCH /albums/:id — 앨범 전체 검토 완료(사진 단위 reviewed 일괄 처리).
 * MSW는 {reviewed}, BE는 {reviewStatus}를 읽는다 — 목 이행(CHMO-195)까지 둘 다 보낸다
 * (서로 모르는 필드는 무시하므로 안전).
 */
export async function markAlbumReviewed(albumId: ID | string): Promise<void> {
  await apiFetch<unknown>(`/albums/${albumId}`, {
    method: 'PATCH',
    body: { reviewed: true, reviewStatus: 'REVIEWED' },
  })
}

/** PATCH /albums/:id — 인물 앨범 이름 변경(모임 단위 personId 이름전파) */
export async function renamePersonAlbum(albumId: ID | string, name: string): Promise<void> {
  await apiFetch<unknown>(`/albums/${albumId}`, { method: 'PATCH', body: { name } })
}

/** GET /albums/:id/move-suggestions — 선택 사진 기준 이동 추천(유사도순 + 공통) */
export function getMoveSuggestions(
  albumId: ID | string,
  photoIds: ID[],
  signal?: AbortSignal,
): Promise<MoveSuggestion[]> {
  return apiFetch<RawMoveSuggestion[] | { suggestions: RawMoveSuggestion[] }>(
    `/albums/${albumId}/move-suggestions?photoIds=${photoIds.join(',')}`,
    { signal },
  ).then((raw) => unwrapList(raw, 'suggestions').map(toMoveSuggestion))
}

/** POST /photos/move — 사진을 다른 앨범으로(다대다 연결 교체 — 복사 아님) */
export function movePhotos(input: {
  photoIds: ID[]
  sourceAlbumId: ID
  targetAlbumId: ID
}): Promise<MovePhotosResponse> {
  return apiFetch<{ movedCount: number }>('/photos/move', { method: 'POST', body: input }).then(
    (raw) => ({ movedCount: raw.movedCount }),
  )
}

/** MSW는 아직 옛 계약({removedCount, albumId})을 준다 — 목 이행(CHMO-195)까지 흡수 */
interface RawDeletePhotos extends Partial<DeletePhotosResponse> {
  removedCount?: number
}

/** DELETE /photos — 현재 앨범 연결 해제(마지막 연결이면 완전 삭제) */
export function deletePhotos(input: {
  albumId: ID
  photoIds: ID[]
}): Promise<DeletePhotosResponse> {
  return apiFetch<RawDeletePhotos>('/photos', { method: 'DELETE', body: input }).then((raw) => ({
    detachedCount: raw.detachedCount ?? raw.removedCount ?? 0,
    deletedPhotoCount: raw.deletedPhotoCount ?? 0,
  }))
}
