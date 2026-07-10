/**
 * 앨범·사진 엔드포인트 (CHMO-192) — 09 앨범 상세(선택/삭제/검토)·09-1 옮기기.
 * BE AlbumDetailResponse는 photos를 내장하고({album, photos} 래핑 없음),
 * 검토 완료는 reviewStatus enum으로 받는다 — 차이는 전부 여기서 흡수.
 */
import { apiFetch } from './client'
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

/** BE AlbumDetailResponse — 앨범 요약에 photos가 내장된다 */
type RawAlbumDetail = RawAlbum & { photos: RawPhoto[] }

/** GET /albums/:id — 앨범 상세(사진 포함) */
export function getAlbumWithPhotos(
  albumId: ID | string,
  signal?: AbortSignal,
): Promise<AlbumWithPhotos> {
  return apiFetch<RawAlbumDetail>(`/albums/${albumId}`, { signal }).then((raw) => ({
    album: toAlbum(raw),
    photos: raw.photos.map(toPhoto),
  }))
}

/**
 * PATCH /albums/:id — 앨범 전체 검토 완료(사진 단위 reviewed 일괄 처리).
 * 앨범엔 검토 상태가 없다 — 서버가 앨범 내 전 사진의 reviewed를 일괄 갱신한다.
 */
export async function markAlbumReviewed(albumId: ID | string): Promise<void> {
  await apiFetch<unknown>(`/albums/${albumId}`, {
    method: 'PATCH',
    body: { reviewStatus: 'REVIEWED' },
  })
}

/** PATCH /albums/:id — 인물 앨범 이름 변경(모임 단위 personId 이름전파) */
export async function renamePersonAlbum(albumId: ID | string, name: string): Promise<void> {
  await apiFetch<unknown>(`/albums/${albumId}`, { method: 'PATCH', body: { name } })
}

/** GET /albums/:id/move-suggestions — 선택 사진 기준 이동 추천(유사도순 + 공통, bare 배열) */
export function getMoveSuggestions(
  albumId: ID | string,
  photoIds: ID[],
  signal?: AbortSignal,
): Promise<MoveSuggestion[]> {
  return apiFetch<RawMoveSuggestion[]>(
    `/albums/${albumId}/move-suggestions?photoIds=${photoIds.join(',')}`,
    { signal },
  ).then((raw) => raw.map(toMoveSuggestion))
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

/** DELETE /photos — 현재 앨범 연결 해제(마지막 연결이면 완전 삭제) */
export function deletePhotos(input: {
  albumId: ID
  photoIds: ID[]
}): Promise<DeletePhotosResponse> {
  return apiFetch<DeletePhotosResponse>('/photos', { method: 'DELETE', body: input }).then(
    (raw) => ({
      detachedCount: raw.detachedCount,
      deletedPhotoCount: raw.deletedPhotoCount,
    }),
  )
}
