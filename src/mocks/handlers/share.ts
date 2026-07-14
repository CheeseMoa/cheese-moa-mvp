/**
 * 학부모 뷰어 핸들러 (docs/api-spec.md §3.6) — 무로그인, 모임 공유 토큰 범위.
 * 잠금 해제 → 공개 이벤트 목록 → 이벤트 앨범 → 앨범 상세/다운로드.
 *
 * 서버 필터링 책임(FE는 받은 대로 렌더):
 * - published 이벤트만 목록 노출
 * - person/common 앨범만, 그중 검토 완료 사진이 있는 앨범만
 * - 사진은 reviewed: true만 (공개 후 추가된 미검토 사진 비노출)
 */
import { http, HttpResponse } from 'msw'
import type { AlbumDownloadResponse } from '../../types/api'
import {
  byEventRecency,
  db,
  eventsOfGroup,
  findAlbum,
  findEvent,
  issueViewerToken,
  personNameOf,
  resolveViewerShareToken,
  reviewedPhotosOfAlbum,
  settleAnalysis,
  type DbAlbum,
  type DbEvent,
  type DbGroup,
} from '../db'
import {
  api,
  errorResponse,
  invalidRequest,
  notFound,
  ok,
  readJson,
  requiredString,
  toId,
  unauthorized,
} from './shared'
import {
  isViewerVisibleType,
  toViewerAlbumSummary,
  toViewerEventSummary,
  toViewerPhoto,
  viewerAlbumsOfEvent,
} from './serializers'

const SHARE_NOT_FOUND = '공유 링크를 찾을 수 없습니다.'

function groupByShareToken(token: string): DbGroup | undefined {
  return db.groups.find((g) => g.share.token === token)
}

/** 뷰어 토큰 검증 — 토큰이 경로의 공유 token과 일치해야 한다(모임 범위 제한) */
function viewerGroup(request: Request, tokenParam: string): DbGroup | null {
  const shareToken = resolveViewerShareToken(request.headers.get('Authorization'))
  if (!shareToken || shareToken !== tokenParam) return null
  return groupByShareToken(tokenParam) ?? null
}

/** 해당 모임의 공개(published) 이벤트 조회 — 아니면 null → 404(비공개 이벤트 존재를 숨김) */
function publishedEvent(group: DbGroup, eventId: number | null): DbEvent | null {
  const event = findEvent(eventId)
  if (!event || event.groupId !== group.id || event.status !== 'published') return null
  return event
}

/**
 * 뷰어 앨범 접근 해석(상세·다운로드 공용) — 토큰→공개 이벤트→뷰어 노출 앨범까지 검증.
 * 실패 시 그대로 반환할 HttpResponse, 성공 시 {event, album}. 딥링크 진입도 최신 앨범이
 * 반영되게 settleAnalysis를 여기서 한 번 태운다(두 핸들러 공통).
 */
function resolveViewerAlbum(
  request: Request,
  token: string,
  eventId: number | null,
  albumId: number | null,
): { event: DbEvent; album: DbAlbum } | Response {
  const group = viewerGroup(request, token)
  if (!group) return unauthorized()
  const event = publishedEvent(group, eventId)
  if (!event) return notFound('공개된 이벤트가 아닙니다.')
  settleAnalysis(event.id)
  const album = findAlbum(albumId)
  if (!album || album.eventId !== event.id || !isViewerVisibleType(album))
    return notFound('앨범을 찾을 수 없습니다.')
  return { event, album }
}

export const shareHandlers = [
  // POST /share/:token/unlock — 학부모 전용 비밀번호로 잠금 해제 · 화면 15 진입 전
  http.post(api('/share/:token/unlock'), async ({ request, params }) => {
    const group = groupByShareToken(params.token as string)
    if (!group) return notFound(SHARE_NOT_FOUND)

    const body = await readJson<{ password?: unknown }>(request)
    const password = requiredString(body?.password)
    if (!password) return invalidRequest('비밀번호를 입력해 주세요.')
    // BE JOIN403 — 모임 참여(제작자 비밀번호)도 같은 코드를 쓴다
    if (password !== group.share.password)
      return errorResponse(403, 'JOIN403', '비밀번호가 일치하지 않습니다.')

    // 모임명은 이 응답에만 온다 — 목록(GET /share/:token)은 bare 배열이라 이름이 없다
    return ok({
      viewerToken: issueViewerToken(group.share.token),
      groupId: group.id,
      groupName: group.name,
    })
  }),

  // GET /share/:token — 공개 이벤트 목록(bare 배열, 모임명 없음) · 화면 15-L
  http.get(api('/share/:token'), ({ request, params }) => {
    const group = viewerGroup(request, params.token as string)
    if (!group) return unauthorized()

    const events = eventsOfGroup(group.id).filter((e) => e.status === 'published')
    // 공개 유지 중 증분 분석이 끝났으면 새 앨범 반영(조회 시점 판정)
    for (const event of events) settleAnalysis(event.id)
    events.sort(byEventRecency)

    return ok(events.map(toViewerEventSummary))
  }),

  // GET /share/:token/events/:eventId — 공개 이벤트 앨범(person/common만) · 화면 15
  http.get(api('/share/:token/events/:eventId'), ({ request, params }) => {
    const group = viewerGroup(request, params.token as string)
    if (!group) return unauthorized()
    const event = publishedEvent(group, toId(params.eventId))
    if (!event) return notFound('공개된 이벤트가 아닙니다.')
    settleAnalysis(event.id)

    // BE ViewerEventAlbumsResponse — eventId·eventName이 평면 필드다
    return ok({
      eventId: event.id,
      eventName: event.name,
      albums: viewerAlbumsOfEvent(event.id).map(toViewerAlbumSummary),
    })
  }),

  // GET /share/:token/events/:eventId/albums/:albumId — 앨범 상세(검토 완료 사진만) · 화면 16
  http.get(api('/share/:token/events/:eventId/albums/:albumId'), ({ request, params }) => {
    const resolved = resolveViewerAlbum(
      request,
      params.token as string,
      toId(params.eventId),
      toId(params.albumId),
    )
    if (!('album' in resolved)) return resolved

    // BE ViewerAlbumPhotosResponse — type도 photoCount도 없고 personName만 온다(공통 앨범은 null)
    return ok({
      albumId: resolved.album.id,
      personName: personNameOf(resolved.album),
      photos: reviewedPhotosOfAlbum(resolved.album.id).map(toViewerPhoto),
    })
  }),

  // GET …/albums/:albumId/download — 앨범 일괄 다운로드(zip URL 변형) · 화면 16
  http.get(api('/share/:token/events/:eventId/albums/:albumId/download'), ({ request, params }) => {
    const resolved = resolveViewerAlbum(
      request,
      params.token as string,
      toId(params.eventId),
      toId(params.albumId),
    )
    if (!('album' in resolved)) return resolved

    const response: AlbumDownloadResponse = {
      downloadUrl: `${window.location.origin}/mock-zip/${resolved.event.id}_${resolved.album.id}.zip`,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    }
    return ok(response)
  }),

  // 가짜 zip 다운로드 — 빈 ZIP(EOCD 22바이트)으로 다운로드 동작 자체를 시뮬레이션
  http.get('/mock-zip/:filename', ({ params }) => {
    const emptyZip = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array<number>(18).fill(0)])
    return new HttpResponse(new Blob([emptyZip], { type: 'application/zip' }), {
      status: 200,
      headers: { 'Content-Disposition': `attachment; filename="${params.filename as string}"` },
    })
  }),
]
