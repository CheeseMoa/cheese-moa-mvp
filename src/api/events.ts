/**
 * 이벤트 엔드포인트 (CHMO-192) — 05 이벤트 목록·06 생성/업로드/분석·08 앨범 그리드·14 공개 요약.
 * BE enum(EMPTY/ANALYZING/…)·eventDate·thumbnailUrl 차이는 mappers.ts가 흡수한다.
 */
import { ApiRequestError, apiFetch } from './client'
import {
  toAlbum,
  toEvent,
  toParentEventPhotos,
  type RawAlbum,
  type RawEvent,
  type RawParentEventPhotos,
} from './mappers'
import type {
  Album,
  AlbumDownloadResponse,
  EventItem,
  ID,
  ParentEventPhotos,
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

/**
 * BE ReviewSummaryResponse — 프리뷰 썸네일 대신 앨범 요약 배열이 온다.
 * reviewedPhotoCount·uncertainCount는 BE가 계속 주지만 14가 더는 보여주지 않아 매핑하지 않는다
 * (CHMO-347·357). BE의 reviewedAlbums/unreviewedAlbums도 안 쓴다 — 특수 앨범까지 세는 값이라
 * 인물·공통만 세는 14의 검토 진척과 다르다(아래 파생 참조).
 */
interface RawReviewSummary {
  reviewedPhotoCount: number
  uncertainCount: number
  totalPhotos: number
  totalAlbums: number
  albums: RawAlbum[]
}

/**
 * GET /events/:id/review-summary — 공개 요약(14).
 * BE는 이벤트의 **앨범 전체**(특수 앨범 포함)를 주고, 무엇을 어떻게 보여줄지는 전부 FE 파생이다.
 * 검토 진척은 앨범 단위로 센다(CHMO-357) — 인물·공통(사진 보유)만 세고, 완료 판정은
 * 08 앨범 카드 테두리 규칙(미검토 사진 0)과 동일해 통계와 카드가 항상 일치한다.
 * 같은 집합을 세 갈래로 나눈다: 완료분 = `previewAlbums`, 잔여분 = `unreviewedAlbums`(공개를 막는 앨범).
 *
 * 미리보기 = **전 사진 검토 완료된** 인물·공통 앨범(CHMO-488) — 발행 대상과 정확히 같은 집합이다
 * (`reviewedAlbumCount`가 세는 것과 동일). 종전엔 '검토 완료 사진이 1장이라도 있는' 앨범까지
 * 담았는데(CHMO-346), 발행은 전 사진 검토된 앨범만 내보내므로 검수하다 만 앨범이
 * "학부모가 볼 화면"에 섞여 보였다 — 지금 공개해도 안 나가는 앨범이다.
 * 전부 미검토면 빈 미리보기가 정직한 응답이다.
 *
 * 나머지 한 갈래가 `excludedAlbums`(CHMO-521) — 사진이 있는 특수 앨범이다. 검토 대상도 발행
 * 대상도 아니라 위 통계·미리보기 어디에도 안 잡히는데, 사진은 실재하므로 14가 "이건 공개되지
 * 않아요"라고 밝혀 준다(안 밝히면 검토를 다 끝낸 사람에게 그 사진들의 행방이 사라진다).
 */
export function getReviewSummary(
  eventId: ID | string,
  signal?: AbortSignal,
): Promise<ReviewSummary> {
  return apiFetch<RawReviewSummary>(`/events/${eventId}/review-summary`, { signal }).then((raw) => {
    const albums = raw.albums.map(toAlbum)
    const reviewable = albums.filter((a) => a.visibleToViewer && a.photoCount > 0)
    // 검토를 마친 앨범 = 발행 대상 = 미리보기 / 나머지 = 공개를 막는 앨범(서버 409 판정과 같은 범위)
    const reviewed = reviewable.filter((a) => a.unreviewedPhotoCount === 0)
    return {
      photoCount: raw.totalPhotos,
      reviewedAlbumCount: reviewed.length,
      reviewableAlbumCount: reviewable.length,
      unreviewedAlbums: reviewable.filter((a) => a.unreviewedPhotoCount !== 0),
      previewAlbums: reviewed,
      // 공개 대상이 아닌 앨범(사진 보유 특수 앨범) — 14가 "이건 안 나가요"를 한 줄로 알린다(CHMO-521).
      // 빈 특수 앨범은 알릴 것이 없어 뺀다(안 나가는 사진이 0장이다)
      excludedAlbums: albums.filter((a) => !a.visibleToViewer && a.photoCount > 0),
    }
  })
}

/**
 * POST /events/:id/publish — 이벤트 공개.
 * `?force=true`는 폐기됐다(CHMO-488) — 전량 검토 완료가 공개의 하드 게이트라 미검토가 남으면
 * 서버가 항상 409(PUBLISH409)로 막고, 14는 애초에 버튼을 잠가 그 상태로 호출하지 않는다.
 */
export async function publishEvent(eventId: ID | string): Promise<void> {
  await apiFetch<unknown>(`/events/${eventId}/publish`, { method: 'POST' })
}

// ── 학부모 사진 조회 (학부모 전환 §5 — ACTIVE PARENT 전용) ───

/**
 * GET /events/:id/parent-photos — 이 이벤트에서 학부모가 볼 수 있는 사진 전체(플랫).
 * 범위: 매핑된 인물 + 공통(Q1), published만(뷰어 노출 규칙 이관 — 특수 앨범 은닉).
 * 매핑 0건(미연결)이면 공통만 — 빈 배열 가능(승인 후 미연결이 기본 경로, §2).
 */
export function getParentEventPhotos(
  eventId: ID | string,
  signal?: AbortSignal,
): Promise<ParentEventPhotos> {
  return apiFetch<RawParentEventPhotos>(`/events/${eventId}/parent-photos`, { signal }).then(
    toParentEventPhotos,
  )
}

/** GET /events/:id/parent-photos/download — 같은 범위의 이벤트 단위 zip(기존 앨범 zip 응답
 * 재사용). ⚠ 화면은 더 이상 호출하지 않는다(CHMO-473 — ZIP 폐지) — 계약 테스트 고정용 */
export function getParentPhotosZip(eventId: ID | string): Promise<AlbumDownloadResponse> {
  return apiFetch<AlbumDownloadResponse>(`/events/${eventId}/parent-photos/download`)
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
