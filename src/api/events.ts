/**
 * 이벤트 엔드포인트 (CHMO-192) — 05 이벤트 목록·06 생성/업로드/분석·08 앨범 그리드·14 공개 전 검수.
 * BE enum(EMPTY/ANALYZING/…)·eventDate·thumbnailUrl 차이는 mappers.ts가 흡수한다.
 */
import { apiFetch, unwrapList } from './client'
import { toAlbum, toEvent, type RawAlbum, type RawEvent } from './mappers'
import type {
  Album,
  AnalyzeRequest,
  EventItem,
  ID,
  PresignFileRequest,
  PresignUpload,
  ReviewSummary,
} from '../types/api'

/** GET /groups/:id/events — 모임의 이벤트 목록 */
export function listGroupEvents(groupId: ID | string, signal?: AbortSignal): Promise<EventItem[]> {
  return apiFetch<RawEvent[] | { events: RawEvent[] }>(`/groups/${groupId}/events`, {
    signal,
  }).then((raw) => unwrapList(raw, 'events').map(toEvent))
}

/** POST /groups/:id/events — 이벤트 생성(이름만 — 날짜는 서버 기본) */
export function createEvent(groupId: ID | string, input: { name: string }): Promise<EventItem> {
  return apiFetch<RawEvent>(`/groups/${groupId}/events`, { method: 'POST', body: input }).then(
    toEvent,
  )
}

/** GET /events/:id — 이벤트 상세(상태 분기용) */
export function getEvent(eventId: ID | string, signal?: AbortSignal): Promise<EventItem> {
  return apiFetch<RawEvent>(`/events/${eventId}`, { signal }).then(toEvent)
}

/** PATCH /events/:id — 이벤트 이름 수정(호출부는 성공 후 refetch — 응답은 쓰지 않는다) */
export async function renameEvent(eventId: ID | string, name: string): Promise<void> {
  await apiFetch<unknown>(`/events/${eventId}`, { method: 'PATCH', body: { name } })
}

/** GET /events/:id/albums — 이벤트의 앨범 목록(08 그리드) */
export function listEventAlbums(eventId: ID | string, signal?: AbortSignal): Promise<Album[]> {
  return apiFetch<RawAlbum[] | { albums: RawAlbum[] }>(`/events/${eventId}/albums`, {
    signal,
  }).then((raw) => unwrapList(raw, 'albums').map(toAlbum))
}

/** BE ReviewSummaryResponse — 프리뷰 썸네일 대신 앨범 요약 배열이 온다 */
interface RawReviewSummary extends Partial<ReviewSummary> {
  reviewedPhotoCount: number
  uncertainCount: number
  totalPhotos?: number
  totalAlbums?: number
  albums?: RawAlbum[]
}

/**
 * GET /events/:id/review-summary — 공개 전 검수 요약(14).
 * BE엔 previewThumbnailUrls가 없어 albums[].thumbnailUrl에서 파생한다 —
 * 뷰어 노출 규칙(person/common)의 앨범 커버만, 최대 6장(FE 계약과 동일 취지).
 */
export function getReviewSummary(
  eventId: ID | string,
  signal?: AbortSignal,
): Promise<ReviewSummary> {
  return apiFetch<RawReviewSummary>(`/events/${eventId}/review-summary`, { signal }).then((raw) => {
    if (raw.previewThumbnailUrls) return raw as ReviewSummary
    const albums = (raw.albums ?? []).map(toAlbum)
    return {
      photoCount: raw.totalPhotos ?? 0,
      albumCount: raw.totalAlbums ?? 0,
      reviewedPhotoCount: raw.reviewedPhotoCount,
      totalPhotoCount: raw.totalPhotos ?? 0,
      uncertainCount: raw.uncertainCount,
      previewThumbnailUrls: albums
        .filter((a) => a.type === 'person' || a.type === 'common')
        .map((a) => a.coverThumbnailUrl)
        .filter((url): url is string => !!url)
        .slice(0, 6),
    }
  })
}

/** POST /events/:id/publish — 이벤트 공개. force는 미검토 사진이 있어도 공개(14 확인 다이얼로그 후) */
export async function publishEvent(
  eventId: ID | string,
  opts: { force?: boolean } = {},
): Promise<void> {
  await apiFetch<unknown>(`/events/${eventId}/publish${opts.force ? '?force=true' : ''}`, {
    method: 'POST',
  })
}

/**
 * POST /events/:id/photos/presign — 업로드 URL 발급(06-U ①).
 * BE는 {s3Key, uploadUrl}의 bare 배열 + 별도 등록 단계(3단계 업로드)라 계약이 다르다 —
 * 실 BE 업로드 흐름 전환은 CHMO-194. 여기선 MSW 계약(uploads 언래핑)만 정리해 둔다.
 */
export function presignUploads(
  eventId: ID | string,
  files: PresignFileRequest[],
): Promise<PresignUpload[]> {
  return apiFetch<PresignUpload[] | { uploads: PresignUpload[] }>(
    `/events/${eventId}/photos/presign`,
    { method: 'POST', body: { files } },
  ).then((raw) => unwrapList(raw, 'uploads'))
}

/** POST /events/:id/analyze — AI 분석 시작(06-U ③). 완료 확인은 이벤트 상세 재진입(폴링 없음 — MVP) */
export async function startAnalysis(eventId: ID | string, input: AnalyzeRequest): Promise<void> {
  await apiFetch<unknown>(`/events/${eventId}/analyze`, { method: 'POST', body: input })
}
