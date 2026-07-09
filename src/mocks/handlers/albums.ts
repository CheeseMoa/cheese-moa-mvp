/**
 * 앨범·검수 핸들러 (docs/api-spec.md §3.5) —
 * 앨범 그리드/상세 + 검토 완료·이름 변경(이름전파) + 이동 추천 + 사진 이동/제거(다대다).
 */
import { http, HttpResponse } from 'msw'
import type { MoveSuggestion } from '../../types/api'
import {
  albumName,
  findAlbum,
  movePhotoBetweenAlbums,
  photosOfAlbum,
  recomputeEventReadiness,
  removePhotoFromAlbum,
  renamePerson,
  settleAnalysis,
  type DbAlbum,
  type DbUser,
} from '../db'
import {
  accessibleEvent,
  api,
  errorResponse,
  invalidBody,
  notFound,
  readJson,
  requiredIdArray,
  requiredString,
  toId,
  unauthorized,
  userFrom,
} from './shared'
import { albumsOfEventSorted, toAlbum, toPhoto } from './serializers'

const ALBUM_NOT_FOUND = '앨범을 찾을 수 없습니다.'

/** 멤버가 접근 가능한 앨범 조회(소속 이벤트의 모임 멤버십 = accessibleEvent 재사용, 아니면 null → 404) */
function accessibleAlbum(user: DbUser, albumId: number | null): DbAlbum | null {
  const album = findAlbum(albumId)
  if (!album || !accessibleEvent(user, album.eventId)) return null
  return album
}

/** 선택 사진이 모두 해당 앨범에 연결돼 있는지 — 아니면 요청 자체가 잘못(400) */
function allPhotosInAlbum(photoIds: number[], albumId: number): boolean {
  const linked = new Set(photosOfAlbum(albumId).map((p) => p.id))
  return photoIds.every((id) => linked.has(id))
}

/** 목 유사도(대표 벡터는 BE 내부 — 결정적 내림차순 값으로 시뮬레이션) */
const MOCK_SIMILARITIES = [0.92, 0.78, 0.65, 0.51, 0.4, 0.31]

export const albumHandlers = [
  // GET /events/:id/albums — 앨범 그리드 · 화면 08
  http.get(api('/events/:id/albums'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const event = accessibleEvent(user, toId(params.id))
    if (!event) return notFound('이벤트를 찾을 수 없습니다.')

    // 재진입 시점에 분석 완료 여부 판정 — 완료됐으면 앨범이 생성돼 함께 반환된다
    settleAnalysis(event.id)
    return HttpResponse.json({ albums: albumsOfEventSorted(event.id).map(toAlbum) })
  }),

  // GET /albums/:id — 앨범 상세(사진 목록, 미검토 포함 — 제작자 화면) · 화면 09
  http.get(api('/albums/:id'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const album = accessibleAlbum(user, toId(params.id))
    if (!album) return notFound(ALBUM_NOT_FOUND)
    // 딥링크/북마크로 이 상세에 바로 진입해도 증분 분석 완료가 반영되게(그리드와 동일 시점 판정)
    settleAnalysis(album.eventId)

    return HttpResponse.json({
      album: toAlbum(album),
      photos: photosOfAlbum(album.id).map(toPhoto),
    })
  }),

  // PATCH /albums/:id — 검토 완료(일괄)/인물 이름 변경(이름전파) · 화면 08/09
  http.patch(api('/albums/:id'), async ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const album = accessibleAlbum(user, toId(params.id))
    if (!album) return notFound(ALBUM_NOT_FOUND)

    const body = await readJson<{ reviewed?: unknown; name?: unknown }>(request)
    if (!body) return invalidBody()

    // 두 필드를 모두 검증한 뒤에만 변이한다 — 검증 도중 400이 나가면 아무것도 저장되지 않아야
    // 한다(rename은 모임 전체 이름전파라, 부분 반영이 남으면 클라이언트가 실패로 알고
    // refetch를 생략한 채 데이터만 바뀌는 불일치가 생긴다)
    let rename: { personId: number; name: string } | undefined
    if (body.name !== undefined) {
      // 이름은 personId 단위 공유 값 — 같은 모임 내 모든 이벤트의 해당 인물 앨범에 전파
      if (album.type !== 'person' || !album.personId)
        return errorResponse(400, 'VALIDATION_ERROR', '특수 앨범의 이름은 변경할 수 없습니다.')
      const name = requiredString(body.name)
      if (!name) return errorResponse(400, 'VALIDATION_ERROR', '이름을 입력해 주세요.')
      rename = { personId: album.personId, name }
    }
    if (body.reviewed !== undefined && typeof body.reviewed !== 'boolean')
      return errorResponse(400, 'VALIDATION_ERROR', 'reviewed는 true/false여야 합니다.')

    if (rename) renamePerson(rename.personId, rename.name)
    if (typeof body.reviewed === 'boolean') {
      // 앨범 [검토 완료] = 앨범 내 전 사진 일괄 처리(저장은 사진 단위 — 앨범엔 상태 없음)
      for (const photo of photosOfAlbum(album.id)) photo.reviewed = body.reviewed
      // 이벤트 전 사진 reviewed면 ready, 해제되면 review로(published는 유지)
      recomputeEventReadiness(album.eventId)
    }

    return HttpResponse.json(toAlbum(album))
  }),

  // GET /albums/:id/move-suggestions?photoIds=… — 이동 추천 · 화면 09-1
  http.get(api('/albums/:id/move-suggestions'), ({ request, params }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()
    const album = accessibleAlbum(user, toId(params.id))
    if (!album) return notFound(ALBUM_NOT_FOUND)

    const photoIdsParam = new URL(request.url).searchParams.get('photoIds')
    const photoIds = requiredIdArray(photoIdsParam ? photoIdsParam.split(',') : undefined)
    if (!photoIds) return errorResponse(400, 'VALIDATION_ERROR', '이동할 사진을 선택해 주세요.')
    if (!allPhotosInAlbum(photoIds, album.id))
      return errorResponse(400, 'VALIDATION_ERROR', '선택한 사진이 이 앨범에 없습니다.')

    // 같은 이벤트의 다른 인물 앨범(목 유사도 내림차순) + 공통 앨범(고정 옵션, similarity null)
    const siblings = albumsOfEventSorted(album.eventId).filter((a) => a.id !== album.id)
    const suggestions: MoveSuggestion[] = siblings
      .filter((a) => a.type === 'person')
      .map((a, i) => ({
        albumId: a.id,
        name: albumName(a),
        similarity: MOCK_SIMILARITIES[i] ?? 0.25,
      }))
    const common = siblings.find((a) => a.type === 'common')
    if (common) suggestions.push({ albumId: common.id, name: albumName(common), similarity: null })

    return HttpResponse.json({ suggestions })
  }),

  // POST /photos/move — 사진 이동 = source 연결 해제 + target 연결(복사 아님) · 화면 09-1
  http.post(api('/photos/move'), async ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    const body = await readJson<{
      photoIds?: unknown
      sourceAlbumId?: unknown
      targetAlbumId?: unknown
    }>(request)
    if (!body) return invalidBody()

    const photoIds = requiredIdArray(body.photoIds)
    const sourceAlbumId = toId(body.sourceAlbumId)
    const targetAlbumId = toId(body.targetAlbumId)
    if (!photoIds || !sourceAlbumId || !targetAlbumId)
      return errorResponse(400, 'VALIDATION_ERROR', '이동할 사진과 원본/대상 앨범을 지정해 주세요.')
    if (sourceAlbumId === targetAlbumId)
      return errorResponse(400, 'VALIDATION_ERROR', '원본과 대상 앨범이 같습니다.')

    const source = accessibleAlbum(user, sourceAlbumId)
    const target = accessibleAlbum(user, targetAlbumId)
    if (!source || !target) return notFound(ALBUM_NOT_FOUND)
    if (source.eventId !== target.eventId)
      return errorResponse(400, 'VALIDATION_ERROR', '다른 이벤트의 앨범으로는 이동할 수 없습니다.')
    if (!allPhotosInAlbum(photoIds, source.id))
      return errorResponse(400, 'VALIDATION_ERROR', '선택한 사진이 원본 앨범에 없습니다.')

    for (const photoId of photoIds) movePhotoBetweenAlbums(photoId, source.id, target.id)

    // 목 옛 계약(api-spec) — BE 형태({movedCount}만)로의 이행은 CHMO-195
    const response = {
      movedCount: photoIds.length,
      sourceAlbumId: source.id,
      targetAlbumId: target.id,
    }
    return HttpResponse.json(response)
  }),

  // DELETE /photos — 앨범에서 사진 제거(해당 앨범 연결만 해제, 마지막 연결이면 완전 삭제) · 화면 09
  http.delete(api('/photos'), async ({ request }) => {
    const user = userFrom(request)
    if (!user) return unauthorized()

    const body = await readJson<{ albumId?: unknown; photoIds?: unknown }>(request)
    if (!body) return invalidBody()

    const albumId = toId(body.albumId)
    const photoIds = requiredIdArray(body.photoIds)
    if (!albumId || !photoIds)
      return errorResponse(400, 'VALIDATION_ERROR', '제거할 사진과 앨범을 지정해 주세요.')

    const album = accessibleAlbum(user, albumId)
    if (!album) return notFound(ALBUM_NOT_FOUND)
    if (!allPhotosInAlbum(photoIds, album.id))
      return errorResponse(400, 'VALIDATION_ERROR', '선택한 사진이 이 앨범에 없습니다.')

    for (const photoId of photoIds) removePhotoFromAlbum(photoId, album.id)
    // 미검토 사진이 삭제로 사라졌으면 이벤트가 ready로, 전부 사라졌으면 empty로 재계산
    recomputeEventReadiness(album.eventId)

    // 목 옛 계약(api-spec) — BE 형태({detachedCount, deletedPhotoCount})로의 이행은 CHMO-195
    const response = { removedCount: photoIds.length, albumId: album.id }
    return HttpResponse.json(response)
  }),
]
