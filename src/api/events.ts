/**
 * 이벤트 엔드포인트 (CHMO-192) — 05 이벤트 목록·06 생성/업로드/분석·08 앨범 그리드·14 공개 전 검수.
 * BE enum(EMPTY/ANALYZING/…)·eventDate·thumbnailUrl 차이는 mappers.ts가 흡수한다.
 */
import { ApiRequestError, apiFetch } from './client'
import { toAlbum, toEvent, type RawAlbum, type RawEvent } from './mappers'
import type {
  Album,
  EventItem,
  ID,
  PresignFileRequest,
  PresignUpload,
  RegisterPhotosRequest,
  RegisterPhotosResult,
  ReviewSummary,
} from '../types/api'

/** GET /groups/:id/events — 모임의 이벤트 목록(bare 배열) */
export function listGroupEvents(groupId: ID | string, signal?: AbortSignal): Promise<EventItem[]> {
  return apiFetch<RawEvent[]>(`/groups/${groupId}/events`, { signal }).then((raw) =>
    raw.map(toEvent),
  )
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

/**
 * DELETE /events/:id — 이벤트 삭제(하위 앨범·사진 연쇄, published면 뷰어 목록에서도 사라짐).
 * BE는 CHMO-272 진행 중(스웨거 미배포) — 응답 본문은 쓰지 않으므로 봉투 result 형태와 무관.
 */
export function deleteEvent(eventId: ID | string): Promise<void> {
  return apiFetch<unknown>(`/events/${eventId}`, { method: 'DELETE' }).then(() => undefined)
}

/** GET /events/:id/albums — 이벤트의 앨범 목록(08 그리드, bare 배열) */
export function listEventAlbums(eventId: ID | string, signal?: AbortSignal): Promise<Album[]> {
  return apiFetch<RawAlbum[]>(`/events/${eventId}/albums`, { signal }).then((raw) =>
    raw.map(toAlbum),
  )
}

/** BE ReviewSummaryResponse — 프리뷰 썸네일 대신 앨범 요약 배열이 온다 */
interface RawReviewSummary {
  reviewedPhotoCount: number
  uncertainCount: number
  totalPhotos: number
  totalAlbums: number
  albums: RawAlbum[]
}

/**
 * GET /events/:id/review-summary — 공개 전 검수 요약(14).
 * 미리보기는 albums[]에서 파생한다 — 뷰어 노출 규칙(person/common)에
 * **검토 완료 사진이 있는** 앨범만(공개 시 학부모 목록(15)에 보일 앨범과 동일, CHMO-346).
 * 전부 미검토면 빈 미리보기가 정직한 응답이다(미검토 사진은 뷰어 비노출 —
 * 미검토 앨범을 "보일 앨범"으로 담으면 14의 빈 상태 경고가 사라진다).
 */
export function getReviewSummary(
  eventId: ID | string,
  signal?: AbortSignal,
): Promise<ReviewSummary> {
  return apiFetch<RawReviewSummary>(`/events/${eventId}/review-summary`, { signal }).then((raw) => {
    const albums = raw.albums.map(toAlbum)
    return {
      photoCount: raw.totalPhotos,
      albumCount: raw.totalAlbums,
      reviewedPhotoCount: raw.reviewedPhotoCount,
      totalPhotoCount: raw.totalPhotos,
      uncertainCount: raw.uncertainCount,
      previewAlbums: albums.filter(
        (a) => a.visibleToViewer && a.photoCount - (a.unreviewedPhotoCount ?? 0) > 0,
      ),
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

// ── 업로드 3단계 (06-U · CHMO-194) ───────────────────────────
// presign(①) → presigned URL로 S3 직접 PUT(②) → 등록(③). 등록이 곧 분석 시작이다.

/**
 * POST /events/:id/photos/presign — 업로드 URL 발급(①).
 * 응답은 요청 `files`와 같은 순서의 배열. contentType은 BE가 파일명 확장자로 정한다.
 */
export function presignUploads(
  eventId: ID | string,
  files: PresignFileRequest[],
): Promise<PresignUpload[]> {
  return apiFetch<PresignUpload[]>(`/events/${eventId}/photos/presign`, {
    method: 'POST',
    body: { files },
  })
}

/**
 * presigned URL로 S3에 직접 PUT(②) — BE 엔드포인트가 아니라 apiFetch를 타지 않는다.
 * 서명에 `content-type`·`content-length`가 묶여 있어 헤더를 정확히 맞춰야 S3가 받는다
 * (Content-Length는 브라우저가 body 크기로 채운다 — 직접 설정 불가).
 *
 * 실패는 `UPLOAD_FAILED`로 고정한다. presign URL 만료의 401/403이 제작자 세션 만료로
 * 오인돼 로그인으로 튕기지 않게 하는 구분자다(호출부가 code로 분기).
 */
export async function uploadToPresignedUrl(
  upload: PresignUpload,
  file: File,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': upload.contentType },
    body: file,
    signal,
  })
  if (!res.ok)
    throw new ApiRequestError(
      res.status,
      'UPLOAD_FAILED',
      '사진 업로드에 실패했어요. 다시 시도해 주세요.',
    )
}

/**
 * POST /events/:id/photos — 업로드 완료 등록(③).
 * **등록이 곧 분석 시작이다**: BE가 사진을 기록하고 이벤트를 analyzing으로 전이한 뒤 AI 분류를 발행한다.
 * `POST /events/:id/analyze`는 등록 시 발행이 실패했을 때의 **수동 재분석 트리거**라 여기서 부르지 않는다
 * (불렀다면 같은 사진이 두 job으로 발행돼 앞 job의 결과가 버려진다).
 * 완료 확인은 이벤트 상세 재진입(폴링 없음 — MVP).
 */
export function registerPhotos(
  eventId: ID | string,
  input: RegisterPhotosRequest,
): Promise<RegisterPhotosResult> {
  return apiFetch<RegisterPhotosResult>(`/events/${eventId}/photos`, { method: 'POST', body: input })
}
