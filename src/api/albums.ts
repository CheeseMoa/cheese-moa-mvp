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
  AlbumDownloadResponse,
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

/**
 * GET /albums/:id/download — 멤버용 앨범 ZIP URL 발급(CHMO-338, 미검토 포함 전체).
 * person/common만 대상 — 특수 앨범(uncertain·eyes_closed·blurry)은 BE가 ALBUM404를
 * 준다(2026-07-20 실서버 채집).
 * ⚠ 화면은 더 이상 호출하지 않는다(CHMO-473 — ZIP 폐지, 개별 요청 전환). BE 엔드포인트
 * 존치라 계약 테스트 고정용으로만 남긴다.
 */
export function getAlbumZip(albumId: ID | string): Promise<AlbumDownloadResponse> {
  return apiFetch<AlbumDownloadResponse>(`/albums/${albumId}/download`)
}

/** BE CreateAlbumResponse(CHMO-416) — 최소형(썸네일 없음 — 호출부가 그리드/상세 재조회로 얻는다) */
interface RawCreateAlbumResponse {
  albumId: ID
  type: string
  personId: ID | null
  personName: string | null
  photoCount: number
}

/**
 * POST /events/:id/albums — 선택 사진으로 새 인물 앨범 생성(CHMO-416).
 * 생성이 곧 이동이다: 서버가 새 PERSON 앨범을 만들고 선택 사진을 소스 앨범에서 옮긴다
 * (별도 /photos/move 호출 불필요). name은 필수 1~20자(BE blank 거부 — 이름 없는 생성은 없다).
 */
export function createPersonAlbum(
  eventId: ID | string,
  input: { name: string; sourceAlbumId: ID; photoIds: ID[] },
): Promise<{ albumId: ID; photoCount: number }> {
  return apiFetch<RawCreateAlbumResponse>(`/events/${eventId}/albums`, {
    method: 'POST',
    body: input,
  }).then((raw) => ({ albumId: raw.albumId, photoCount: raw.photoCount }))
}

/**
 * DELETE /albums/:id — 앨범 삭제(CHMO-271·435, 전 타입). 사진이 있어도 삭제되며
 * **이 앨범에만 속한 사진은 함께 영구 삭제**된다(다른 앨범에도 연결된 사진은 유지 — N:M).
 */
export function deleteAlbum(albumId: ID | string): Promise<void> {
  return apiFetch<unknown>(`/albums/${albumId}`, { method: 'DELETE' }).then(() => undefined)
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
