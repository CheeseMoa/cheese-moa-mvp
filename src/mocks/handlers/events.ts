/**
 * 이벤트 핸들러 (docs/api-spec.md §3.3~3.4 일부) —
 * 목록/생성/상세/이름수정 + 업로드 presign(2-step) + 분석 시작/상태 확인.
 */
import { http, HttpResponse } from 'msw'
import type { AnalysisJob, PresignFileRequest, PresignUpload } from '../../types/api'
import {
  db,
  findEvent,
  findGroup,
  nextId,
  nowIso,
  photoCountOfEvent,
  settleAnalysis,
  startAnalysis,
  todayIsoDate,
  transitionEvent,
  type DbEvent,
  type DbPhoto,
  type DbUser,
} from '../db'
import {
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
import { toEvent } from './serializers'

const EVENT_NOT_FOUND = '이벤트를 찾을 수 없습니다.'
/** presign 용량 상한(파일당) — 초과 시 413 PAYLOAD_TOO_LARGE */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/** 멤버가 접근 가능한 이벤트 조회(아니면 null → 404) */
function accessibleEvent(user: DbUser, eventId: string): DbEvent | null {
  const event = findEvent(eventId)
  if (!event || !canAccessGroup(user, event.groupId)) return null
  return event
}

export const eventHandlers = [
  // GET /groups/:id/events — 이벤트 목록(최신순) · 화면 05
  http.get(api('/groups/:id/events'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const group = findGroup(params.id as string)
    if (!group || !canAccessGroup(user, group.id)) return notFound('모임을 찾을 수 없습니다.')

    const events = db.events
      .filter((e) => e.groupId === group.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
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
    if (!transitionEvent(event.id, 'analyzing'))
      return errorResponse(400, 'VALIDATION_ERROR', '이미 분석이 시작되었거나 완료된 이벤트입니다.')

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
]
