/**
 * 이벤트 핸들러 (docs/api-spec.md §3.3~3.4, §3.4 검수 요약·공개 포함) —
 * 목록/생성/상세/이름수정 + 업로드 3단계(presign → S3 PUT → 등록) + 분석 상태 확인 + 검수 요약/공개.
 * 업로드 계약은 실 BE 기준(CHMO-194) — 등록(POST /photos)이 곧 분석 시작이다.
 */
import { http, HttpResponse } from 'msw'
import type { AnalysisJob, AnalysisStatus, PresignUpload } from '../../types/api'
import {
  albumsOfEvent,
  byEventRecency,
  db,
  findAnalysisJob,
  findGroup,
  isObjectUploaded,
  markObjectUploaded,
  nextId,
  nowIso,
  photoCountOfAlbum,
  photoCountOfEvent,
  photosOfEvent,
  settleAnalysis,
  startAnalysis,
  todayIsoDate,
  transitionEvent,
  unreviewedCountOfAlbum,
  uploadKeyPrefixOf,
  type DbEvent,
  type DbPhoto,
} from '../db'
import {
  accessibleEvent,
  api,
  canAccessGroup,
  created,
  errorResponse,
  eventNotFound,
  invalidBody,
  invalidRequest,
  notFound,
  ok,
  optionalString,
  readJson,
  requiredString,
  toId,
  unauthorized,
  userFrom,
} from './shared'
import { albumsOfEventSorted, toAlbumSummary, toEventDetail, toEventSummary } from './serializers'
import {
  isUploadableSize,
  MAX_UPLOAD_BATCH,
  MAX_UPLOAD_FILE_LABEL,
  UPLOAD_FORMAT_LABEL,
  uploadContentTypeOf,
  uploadExtensionOf,
} from '../../lib/upload'

const ANALYZING_LOCKED = '분석 중에는 사진을 추가할 수 없습니다.'

export const eventHandlers = [
  // GET /groups/:id/events — 이벤트 목록(최신순, bare 배열) · 화면 05
  http.get(api('/groups/:id/events'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group || !canAccessGroup(user, group.id)) return notFound('모임을 찾을 수 없습니다.')

    const events = db.events.filter((e) => e.groupId === group.id)
    // 조회 시점에 분석 완료 여부 판정(스펙: 화면 재진입/새로고침으로 확인) — published 증분 분석 포함
    for (const event of events) settleAnalysis(event.id)
    events.sort(byEventRecency)
    return ok(events.map(toEventSummary))
  }),

  // POST /groups/:id/events — 이벤트 생성(status: empty) · 화면 06-M
  http.post(api('/groups/:id/events'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(toId(params.id))
    if (!group || !canAccessGroup(user, group.id)) return notFound('모임을 찾을 수 없습니다.')

    const body = await readJson<{ name?: unknown }>(request)
    const name = requiredString(body?.name)
    if (!name) return invalidRequest('이벤트 이름을 입력해 주세요.')

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
    return created(toEventSummary(event))
  }),

  // GET /events/:id — 이벤트 상세 · 화면 06-E / 08
  http.get(api('/events/:id'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, toId(params.id))
    if (!event) return eventNotFound()
    settleAnalysis(event.id)
    return ok(toEventDetail(event))
  }),

  // PATCH /events/:id — 이벤트 이름 수정 · 화면 08
  http.patch(api('/events/:id'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, toId(params.id))
    if (!event) return eventNotFound()

    const body = await readJson<{ name?: unknown }>(request)
    if (!body) return invalidBody()
    const name = optionalString(body.name)
    if (name === null) return invalidRequest('이벤트 이름을 입력해 주세요.')
    if (name !== undefined) event.name = name
    return ok(toEventDetail(event))
  }),

  // POST /events/:id/photos/presign — 업로드 URL 발급(①) · 화면 06-U
  // 사진은 여기서 만들지 않는다 — 등록(③)이 서버 등록 시점이다(BE 계약, CHMO-194).
  http.post(api('/events/:id/photos/presign'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, toId(params.id))
    if (!event) return eventNotFound()
    // 분석 진행 중에만 업로드 불가 — 공개(published) 후에도 사진 추가 가능(새 사진은 미검토로 등록돼 뷰어 비노출)
    if (event.status === 'analyzing') return invalidRequest(ANALYZING_LOCKED)

    const body = await readJson<{ files?: { fileName?: unknown; size?: unknown }[] }>(request)
    const files = body?.files
    if (!Array.isArray(files) || files.length === 0)
      return invalidRequest('파일 목록은 비어 있을 수 없습니다.')
    if (files.length > MAX_UPLOAD_BATCH)
      return invalidRequest(`한 번에 ${MAX_UPLOAD_BATCH}장까지 업로드할 수 있습니다.`)

    const uploads: PresignUpload[] = []
    for (const file of files) {
      const fileName = requiredString(file?.fileName)
      if (!fileName) return invalidRequest('파일 이름은 필수입니다.')
      // BE는 MIME이 아니라 파일명 확장자로 Content-Type을 정한다(화이트리스트 밖이면 거절)
      const extension = uploadExtensionOf(fileName)
      const contentType = uploadContentTypeOf(fileName)
      // BE PHOTO400 — 지원하지 않는 확장자
      if (!extension || !contentType)
        return errorResponse(400, 'PHOTO400', `${UPLOAD_FORMAT_LABEL}만 업로드할 수 있습니다.`)
      if (typeof file.size !== 'number' || !Number.isFinite(file.size))
        return invalidRequest('파일 크기 정보가 올바르지 않습니다.')
      if (!isUploadableSize(file.size))
        return invalidRequest(`파일 크기는 ${MAX_UPLOAD_FILE_LABEL} 이하여야 합니다.`)

      const s3Key = `${uploadKeyPrefixOf(event.id)}${crypto.randomUUID()}.${extension}`
      uploads.push({
        s3Key,
        uploadUrl: `${window.location.origin}/mock-s3/${s3Key}`,
        contentType,
      })
    }
    return ok(uploads)
  }),

  // (②) 가짜 S3 직접 업로드 — 성공 처리하고 키를 기록한다(③이 "PUT 안 한 키"를 거를 수 있게)
  http.put('/mock-s3/*', ({ request }) => {
    const s3Key = decodeURIComponent(new URL(request.url).pathname.slice('/mock-s3/'.length))
    markObjectUploaded(s3Key)
    return new HttpResponse(null, { status: 200 })
  }),

  // POST /events/:id/photos — 업로드 완료 등록(③) · 화면 06-U
  // 등록이 곧 분석 시작이다: 사진을 기록하고 이벤트를 analyzing으로 전이한 뒤 분류 job을 띄운다.
  http.post(api('/events/:id/photos'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, toId(params.id))
    if (!event) return eventNotFound()
    if (event.status === 'analyzing') return invalidRequest(ANALYZING_LOCKED)

    const body = await readJson<{
      s3Keys?: unknown
      excludeEyesClosed?: unknown
      excludeBlurry?: unknown
    }>(request)
    if (!body) return invalidBody()
    const s3Keys = body.s3Keys
    if (!Array.isArray(s3Keys) || s3Keys.length === 0)
      return invalidRequest('s3Key 목록은 비어 있을 수 없습니다.')
    if (s3Keys.length > MAX_UPLOAD_BATCH)
      return invalidRequest(`한 번에 ${MAX_UPLOAD_BATCH}장까지 등록할 수 있습니다.`)
    const prefix = uploadKeyPrefixOf(event.id)
    // BE VALID400 — 다른 이벤트의 업로드 키
    if (s3Keys.some((key) => typeof key !== 'string' || !key.startsWith(prefix)))
      return invalidRequest('이 이벤트의 업로드 키가 아닙니다.')
    // BE StoredObjectChecker(PHOTO404) — S3에 없는 키(PUT 전)는 등록할 수 없다
    if ((s3Keys as string[]).some((key) => !isObjectUploaded(key)))
      return errorResponse(404, 'PHOTO404', 'S3에 업로드되지 않은 사진이 있습니다.')

    // published는 공개를 유지한 채 증분 분석(상태 전이 없음), 그 외에는 analyzing으로 전이
    if (event.status !== 'published' && !transitionEvent(event.id, 'analyzing'))
      return invalidRequest('지금은 사진을 등록할 수 없는 이벤트입니다.')

    const baseIndex = photoCountOfEvent(event.id)
    ;(s3Keys as string[]).forEach((s3Key, i) => {
      const idx = baseIndex + i
      const landscape = idx % 3 !== 2
      const photo: DbPhoto = {
        id: nextId('pht'),
        eventId: event.id,
        s3Key,
        albumIds: [],
        width: landscape ? 1600 : 1200,
        height: landscape ? 1200 : 1600,
        // 픽스처와 동일한 결정적 플래그 규칙(9번째마다 눈감음, 13번째마다 흔들림)
        flags: { eyesClosed: idx % 9 === 8, blurry: idx % 13 === 12 },
        reviewed: false,
        createdAt: nowIso(),
      }
      db.photos.push(photo)
    })
    // 품질 제외 옵션은 analyze가 아니라 등록에 실린다(BE RegisterPhotosRequest) — 생략 시 둘 다 ON
    startAnalysis(event.id, {
      excludeEyesClosed: body.excludeEyesClosed !== false,
      excludeBlurry: body.excludeBlurry !== false,
    })
    return created({ jobId: crypto.randomUUID(), registeredCount: s3Keys.length })
  }),

  // POST /events/:id/analyze — 수동 재분석 트리거(등록 시 자동 발행이 실패한 경우).
  // 업로드 해피패스는 등록(③)이 분석을 시작하므로 화면은 이 엔드포인트를 부르지 않는다.
  http.post(api('/events/:id/analyze'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, toId(params.id))
    if (!event) return eventNotFound()

    // BE: 미처리(아직 분류되지 않은) 업로드가 없으면 400
    const pending = photosOfEvent(event.id).filter((p) => p.albumIds.length === 0)
    if (pending.length === 0) return invalidRequest('분석할 업로드가 없습니다.')
    const previous = findAnalysisJob(event.id)
    if (previous?.status === 'analyzing') return invalidRequest('이미 분석이 진행 중인 이벤트입니다.')
    if (event.status !== 'published' && !transitionEvent(event.id, 'analyzing'))
      return invalidRequest('지금은 분석을 시작할 수 없는 이벤트입니다.')

    // 재발행이라 옵션은 직전 job의 것을 잇는다(BE도 첫 업로드의 옵션을 재사용)
    startAnalysis(event.id, previous?.options ?? { excludeEyesClosed: true, excludeBlurry: true })
    return ok({ jobId: crypto.randomUUID(), imageCount: pending.length })
  }),

  // GET /events/:id/analysis — 분석 상태 확인 · 화면 06-U / 05
  // 폴링 없음: 조회 시점에 목 지연 경과를 판정해 analyzing→done + 이벤트 status→review 전이.
  // BE와 동일하게 이벤트 상태에서 유도한다(EMPTY→none, ANALYZING→analyzing, 그 외 done).
  // 응답 필드 형태는 미채집(BE AnalysisStatusResponse) — 도메인 함수도 화면도 이 엔드포인트를 부르지 않는다.
  http.get(api('/events/:id/analysis'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, toId(params.id))
    if (!event) return eventNotFound()

    settleAnalysis(event.id)
    const analysisStatus: AnalysisStatus =
      event.status === 'empty' ? 'none' : event.status === 'analyzing' ? 'analyzing' : 'done'
    const response: AnalysisJob = { analysisStatus, eventStatus: event.status }
    return ok(response)
  }),

  // GET /events/:id/review-summary — 공개 전 검수 요약 · 화면 14
  // BE ReviewSummaryResponse엔 previewThumbnailUrls가 없다 — 화면이 쓰는 미리보기는
  // api/events.ts가 albums[].thumbnailUrl(뷰어 노출 앨범 커버)에서 파생한다.
  http.get(api('/events/:id/review-summary'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, toId(params.id))
    if (!event) return eventNotFound()
    settleAnalysis(event.id)

    const photos = photosOfEvent(event.id)
    const albums = albumsOfEvent(event.id)
    const uncertainAlbum = albums.find((a) => a.type === 'uncertain')
    // 앨범 검토 상태는 사진 단위 reviewed의 파생값(빈 앨범은 미검토)
    const reviewedAlbums = albums.filter(
      (a) => photoCountOfAlbum(a.id) > 0 && unreviewedCountOfAlbum(a.id) === 0,
    ).length

    return ok({
      eventId: event.id,
      eventStatus: event.status.toUpperCase(),
      totalAlbums: albums.length,
      reviewedAlbums,
      unreviewedAlbums: albums.length - reviewedAlbums,
      totalPhotos: photos.length,
      reviewedPhotoCount: photos.filter((p) => p.reviewed).length,
      uncertainCount: uncertainAlbum ? photoCountOfAlbum(uncertainAlbum.id) : 0,
      albums: albumsOfEventSorted(event.id).map(toAlbumSummary),
    })
  }),

  // POST /events/:id/publish — 공개하기(→published, 모임 학부모 공유 목록에 노출) · 화면 14
  // 경고 정책(스펙 "구현 시 확정"): 미검토 사진 존재 시 ?force=true 없으면 409 반환.
  // force 공개해도 미검토 사진은 뷰어 비노출(사진 단위 필터)이라 안전하다.
  http.post(api('/events/:id/publish'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, toId(params.id))
    if (!event) return eventNotFound()
    settleAnalysis(event.id)

    if (event.status === 'published') return invalidRequest('이미 공개된 이벤트입니다.')
    if (event.status !== 'review' && event.status !== 'ready')
      return invalidRequest('검수 단계의 이벤트만 공개할 수 있습니다.')
    const photos = photosOfEvent(event.id)
    if (photos.length === 0) return invalidRequest('공개할 사진이 없습니다.')

    const force = new URL(request.url).searchParams.get('force') === 'true'
    const unreviewedCount = photos.filter((p) => !p.reviewed).length
    // BE 코드 미확인 — 14 화면이 이 코드로 경고 다이얼로그를 띄운다(PublishReviewPage)
    if (unreviewedCount > 0 && !force)
      return errorResponse(
        409,
        'HAS_UNREVIEWED_PHOTOS',
        `미검토 사진 ${unreviewedCount}장이 있습니다. 그대로 공개하면 해당 사진은 학부모에게 보이지 않습니다.`,
      )

    transitionEvent(event.id, 'published')
    return ok(toEventDetail(event))
  }),
]
