/**
 * 이벤트 핸들러 (docs/api-spec.md §3.3~3.4, §3.4 검수 요약·공개 포함) —
 * 목록/생성/상세/이름수정 + 업로드 presign(2-step) + 분석 시작/상태 확인 + 검수 요약/공개.
 */
import { http, HttpResponse } from 'msw'
import type { AnalysisJob, PresignFileRequest, PresignUpload, ReviewSummary } from '../../types/api'
import {
  albumsOfEvent,
  byEventRecency,
  db,
  findAnalysisJob,
  findGroup,
  nextId,
  nowIso,
  photoCountOfAlbum,
  photoCountOfEvent,
  photosOfEvent,
  recomputeEventReadiness,
  settleAnalysis,
  startAnalysis,
  todayIsoDate,
  transitionEvent,
  type DbEvent,
  type DbPhoto,
} from '../db'
import {
  accessibleEvent,
  api,
  canAccessGroup,
  errorResponse,
  invalidBody,
  notFound,
  optionalString,
  readJson,
  requiredString,
  unauthorized,
  userFrom,
} from './shared'
import { isViewerVisibleType, photoThumbnailUrlOf, toEvent } from './serializers'

const EVENT_NOT_FOUND = '이벤트를 찾을 수 없습니다.'
/** presign 용량 상한(파일당) — 초과 시 413 PAYLOAD_TOO_LARGE */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export const eventHandlers = [
  // GET /groups/:id/events — 이벤트 목록(최신순) · 화면 05
  http.get(api('/groups/:id/events'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(params.id as string)
    if (!group || !canAccessGroup(user, group.id)) return notFound('모임을 찾을 수 없습니다.')

    const events = db.events.filter((e) => e.groupId === group.id)
    // 조회 시점에 분석 완료 여부 판정(스펙: 화면 재진입/새로고침으로 확인) — published 증분 분석 포함
    for (const event of events) settleAnalysis(event.id)
    events.sort(byEventRecency)
    return HttpResponse.json({ events: events.map(toEvent) })
  }),

  // POST /groups/:id/events — 이벤트 생성(status: empty) · 화면 06-M
  http.post(api('/groups/:id/events'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(params.id as string)
    if (!group || !canAccessGroup(user, group.id)) return notFound('모임을 찾을 수 없습니다.')

    const body = await readJson<{ name?: unknown }>(request)
    const name = requiredString(body?.name)
    if (!name) return errorResponse(400, 'VALIDATION_ERROR', '이벤트 이름을 입력해 주세요.')

    const event: DbEvent = {
      id: nextId('evt'),
      groupId: group.id,
      name,
      date: todayIsoDate(),
      status: 'empty',
      createdAt: nowIso(),
      publishedAt: null,
    }
    db.events.push(event)
    return HttpResponse.json(toEvent(event), { status: 201 })
  }),

  // GET /events/:id — 이벤트 상세 · 화면 06-E / 08
  http.get(api('/events/:id'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, params.id as string)
    if (!event) return notFound(EVENT_NOT_FOUND)
    settleAnalysis(event.id)
    return HttpResponse.json(toEvent(event))
  }),

  // PATCH /events/:id — 이벤트 이름 수정 · 화면 08
  http.patch(api('/events/:id'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, params.id as string)
    if (!event) return notFound(EVENT_NOT_FOUND)

    const body = await readJson<{ name?: unknown }>(request)
    if (!body) return invalidBody()
    const name = optionalString(body.name)
    if (name === null) return errorResponse(400, 'VALIDATION_ERROR', '이벤트 이름을 입력해 주세요.')
    if (name !== undefined) event.name = name
    return HttpResponse.json(toEvent(event))
  }),

  // POST /events/:id/photos/presign — 업로드 URL 발급(①) · 화면 06-U
  // 스펙 §5: S3 PUT은 성공 시뮬레이션이므로 presign 시점에 사진 등록을 즉시 반영으로 간주.
  http.post(api('/events/:id/photos/presign'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, params.id as string)
    if (!event) return notFound(EVENT_NOT_FOUND)
    // 분석 진행 중에만 업로드 불가 — 공개(published) 후에도 사진 추가 가능(새 사진은 미검토로 등록돼 뷰어 비노출)
    if (event.status === 'analyzing')
      return errorResponse(400, 'VALIDATION_ERROR', '분석 중에는 사진을 추가할 수 없습니다.')

    const body = await readJson<{ files?: PresignFileRequest[] }>(request)
    const files = body?.files
    if (!Array.isArray(files) || files.length === 0)
      return errorResponse(400, 'VALIDATION_ERROR', '업로드할 파일 정보가 없습니다.')
    for (const file of files) {
      if (
        !requiredString(file?.filename) ||
        typeof file?.contentType !== 'string' ||
        !file.contentType.startsWith('image/')
      )
        return errorResponse(400, 'VALIDATION_ERROR', '이미지 파일만 업로드할 수 있습니다.')
      if (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size <= 0)
        return errorResponse(400, 'VALIDATION_ERROR', '파일 크기 정보가 올바르지 않습니다.')
      if (file.size > MAX_UPLOAD_BYTES)
        return errorResponse(413, 'PAYLOAD_TOO_LARGE', '파일당 최대 20MB까지 업로드할 수 있습니다.')
    }

    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
    const baseIndex = photoCountOfEvent(event.id)
    const uploads: PresignUpload[] = files.map((file, i) => {
      const idx = baseIndex + i
      const landscape = idx % 3 !== 2
      const photo: DbPhoto = {
        id: nextId('pht'),
        eventId: event.id,
        albumIds: [],
        width: landscape ? 1600 : 1200,
        height: landscape ? 1200 : 1600,
        // 픽스처와 동일한 결정적 플래그 규칙(9번째마다 눈감음, 13번째마다 흔들림)
        flags: { eyesClosed: idx % 9 === 8, blurry: idx % 13 === 12 },
        reviewed: false,
        createdAt: nowIso(),
      }
      db.photos.push(photo)
      return {
        photoId: photo.id,
        uploadUrl: `${window.location.origin}/mock-s3/${event.id}/${photo.id}`,
        method: 'PUT',
        headers: { 'Content-Type': file.contentType },
        expiresAt,
      }
    })
    // 새 사진은 미검토(reviewed: false) — 전 사진 검토 완료(ready)였다면 review로 되돌려
    // "ready = 모든 사진 검토완료" 불변식을 지킨다(published는 재계산이 건드리지 않음)
    recomputeEventReadiness(event.id)
    return HttpResponse.json({ uploads })
  }),

  // (②) 가짜 S3 직접 업로드 — presign이 발급한 uploadUrl로의 PUT을 성공 처리
  http.put('/mock-s3/:eventId/:photoId', () => new HttpResponse(null, { status: 200 })),

  // POST /events/:id/analyze — AI 분석 시작(202, 이벤트 status→analyzing) · 화면 06-U
  http.post(api('/events/:id/analyze'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, params.id as string)
    if (!event) return notFound(EVENT_NOT_FOUND)

    if (photoCountOfEvent(event.id) === 0)
      return errorResponse(400, 'VALIDATION_ERROR', '분석할 사진이 없습니다. 먼저 업로드해 주세요.')
    if (findAnalysisJob(event.id)?.status === 'analyzing')
      return errorResponse(400, 'VALIDATION_ERROR', '이미 분석이 진행 중인 이벤트입니다.')
    // published는 공개를 유지한 채 증분 분석(상태 전이 없음), 그 외에는 analyzing으로 전이
    if (event.status !== 'published' && !transitionEvent(event.id, 'analyzing'))
      return errorResponse(400, 'VALIDATION_ERROR', '지금은 분석을 시작할 수 없는 이벤트입니다.')

    const body = await readJson<{ excludeEyesClosed?: boolean; excludeBlurry?: boolean }>(request)
    const job = startAnalysis(event.id, {
      excludeEyesClosed: body?.excludeEyesClosed ?? true,
      excludeBlurry: body?.excludeBlurry ?? true,
    })
    const response: AnalysisJob = { eventId: job.eventId, status: job.status }
    return HttpResponse.json(response, { status: 202 })
  }),

  // GET /events/:id/analysis — 분석 상태 확인 · 화면 06-U / 05
  // 폴링 없음: 조회 시점에 목 지연 경과를 판정해 analyzing→done + 이벤트 status→review 전이.
  http.get(api('/events/:id/analysis'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, params.id as string)
    if (!event) return notFound(EVENT_NOT_FOUND)

    const job = settleAnalysis(event.id)
    if (!job) return notFound('분석 이력이 없습니다.')
    const response: AnalysisJob = { eventId: job.eventId, status: job.status }
    return HttpResponse.json(response)
  }),

  // GET /events/:id/review-summary — 공개 전 검수 요약 · 화면 14
  http.get(api('/events/:id/review-summary'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, params.id as string)
    if (!event) return notFound(EVENT_NOT_FOUND)
    settleAnalysis(event.id)

    const photos = photosOfEvent(event.id)
    const albums = albumsOfEvent(event.id)
    const reviewedPhotos = photos.filter((p) => p.reviewed)
    const uncertainAlbum = albums.find((a) => a.type === 'uncertain')
    // 미리보기 = 학부모 뷰 프리뷰(feature-spec F6.1) — 뷰어 노출 규칙과 같은 필터
    // (person/common 앨범 소속 + 검토 완료)를 적용한다. 검토된 노출 사진이 없으면
    // 빈 미리보기가 정직한 응답(미검토 사진을 "보일 사진"으로 보여주면 안 된다).
    const visibleAlbumIds = new Set(albums.filter(isViewerVisibleType).map((a) => a.id))
    const viewerPhotos = reviewedPhotos.filter((p) =>
      p.albumIds.some((id) => visibleAlbumIds.has(id)),
    )
    const summary: ReviewSummary = {
      photoCount: photos.length,
      albumCount: albums.length,
      reviewedPhotoCount: reviewedPhotos.length,
      totalPhotoCount: photos.length,
      uncertainCount: uncertainAlbum ? photoCountOfAlbum(uncertainAlbum.id) : 0,
      // 3×2 그리드용 최대 6장 — id가 아니라 완성된 썸네일 URL을 내려준다(coverThumbnailUrl과 동일)
      previewThumbnailUrls: viewerPhotos.slice(0, 6).map(photoThumbnailUrlOf),
    }
    return HttpResponse.json(summary)
  }),

  // POST /events/:id/publish — 공개하기(→published, 모임 학부모 공유 목록에 노출) · 화면 14
  // 경고 정책(스펙 "구현 시 확정"): 미검토 사진 존재 시 ?force=true 없으면 409 반환.
  // force 공개해도 미검토 사진은 뷰어 비노출(사진 단위 필터)이라 안전하다.
  http.post(api('/events/:id/publish'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, params.id as string)
    if (!event) return notFound(EVENT_NOT_FOUND)
    settleAnalysis(event.id)

    if (event.status === 'published')
      return errorResponse(400, 'VALIDATION_ERROR', '이미 공개된 이벤트입니다.')
    if (event.status !== 'review' && event.status !== 'ready')
      return errorResponse(400, 'VALIDATION_ERROR', '검수 단계의 이벤트만 공개할 수 있습니다.')
    const photos = photosOfEvent(event.id)
    if (photos.length === 0)
      return errorResponse(400, 'VALIDATION_ERROR', '공개할 사진이 없습니다.')

    const force = new URL(request.url).searchParams.get('force') === 'true'
    const unreviewedCount = photos.filter((p) => !p.reviewed).length
    if (unreviewedCount > 0 && !force)
      return errorResponse(
        409,
        'HAS_UNREVIEWED_PHOTOS',
        `미검토 사진 ${unreviewedCount}장이 있습니다. 그대로 공개하면 해당 사진은 학부모에게 보이지 않습니다.`,
      )

    transitionEvent(event.id, 'published')
    return HttpResponse.json(toEvent(event))
  }),
]
