/**
 * 도메인 함수 계약 테스트 (CHMO-219).
 *
 * 검증하는 명제: **"실 BE가 이렇게 주면 화면은 이렇게 본다."**
 * 타입이 못 잡는 회귀가 여기 있다 — `toEvent`가 `PUBLISHED`를 소문자로 안 바꿔도 `tsc`는 통과한다.
 *
 * MSW 목도 이 형태로 응답한다(CHMO-195) — 목/실서버 겸용 계약이라 두 벌의 케이스가 필요 없다.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { getMe, login } from './auth'
import {
  deletePhotos,
  getAlbumWithPhotos,
  getAlbumZip,
  getMoveSuggestions,
  markAlbumReviewed,
  movePhotos,
} from './albums'
import {
  createEvent,
  getEvent,
  getReviewSummary,
  listEventAlbums,
  listGroupEvents,
  presignUploads,
  registerPhotos,
  uploadToPresignedUrl,
} from './events'
import { findMyGroupByJoinKey, getGroup, getInviteInfo, listGroups } from './groups'
import {
  getViewerAlbumPhotos,
  getViewerAlbums,
  getViewerAlbumZip,
  getViewerEvents,
  unlockViewer,
} from './viewer'
import { setAuthTokens } from '../lib/auth'
import { setViewerGroupName, setViewerToken } from '../lib/viewer'
import {
  BE_ALBUM_COMMON,
  BE_ALBUM_DETAIL,
  BE_ALBUM_EYES_CLOSED,
  BE_ALBUM_PERSON,
  BE_AUTH,
  BE_DELETE_PHOTOS,
  BE_EVENT_CREATED,
  BE_EVENT_DETAIL,
  BE_EVENT_DETAIL_WITH_PROGRESS,
  BE_EVENT_PUBLISHED,
  BE_EVENT_SUMMARY,
  BE_GROUP_DETAIL,
  BE_GROUP_INVITE,
  BE_GROUP_SUMMARY,
  BE_MEMBER_ZIP,
  BE_MOVE_PHOTOS,
  BE_MOVE_SUGGESTION_COMMON,
  BE_MOVE_SUGGESTION_PERSON,
  BE_MOVE_SUGGESTION_UNNAMED_PERSON,
  BE_PRESIGN_UPLOAD,
  BE_REGISTER_PHOTOS,
  BE_REVIEW_SUMMARY,
  BE_USER,
  BE_VIEWER_ALBUM_PHOTOS_COMMON,
  BE_VIEWER_ALBUM_PHOTOS_PERSON,
  BE_VIEWER_ALBUMS,
  BE_VIEWER_UNLOCK,
  BE_VIEWER_ZIP,
  envelope,
  errorEnvelope,
} from '../test/fixtures/be'
import { bodyOf, emptyResponse, jsonResponse, stubFetch } from '../test/http'

const SHARE_TOKEN = 'shr_grp1'

/** 항상 같은 응답을 주는 스텁 — 요청 검증이 필요하면 반환된 calls를 본다 */
function serve(payload: unknown, status = 200) {
  return stubFetch(() => jsonResponse(payload, status))
}

beforeEach(() => {
  setAuthTokens({ accessToken: 'at', refreshToken: 'rt' })
  setViewerToken(SHARE_TOKEN, 'vt')
})

describe('모임', () => {
  it('BE bare 배열 목록 — groupId를 id로 옮기고 role은 항상 null', async () => {
    serve(envelope([BE_GROUP_SUMMARY]))

    await expect(listGroups()).resolves.toEqual([
      {
        id: 6,
        name: 'CHMO-194 업로드검증',
        memberCount: 1,
        eventCount: 1,
        role: null,
        createdAt: '2026-07-10T03:33:06.314638Z',
      },
    ])
  })

  it('BE 빈 목록도 빈 배열로 통과한다', async () => {
    serve(envelope([]))
    await expect(listGroups()).resolves.toEqual([])
  })

  it('BE 상세엔 eventCount가 없다 — 화면이 이벤트 목록 길이로 파생한다', async () => {
    serve(envelope(BE_GROUP_DETAIL))
    const group = await getGroup(6)
    expect(group.id).toBe(6)
    expect(group.eventCount).toBeUndefined()
  })

  it('초대 joinUrl은 BE 것(쿼리형)을 버리고 joinKey로 경로형을 파생한다 (CHMO-237)', async () => {
    serve(envelope({ ...BE_GROUP_INVITE, joinKey: 'Fh1TDIk81EPP' }))
    const invite = await getInviteInfo(6)
    expect(invite.joinKey).toBe('Fh1TDIk81EPP')
    // node 환경엔 window가 없어 오리진이 빈다 — 경로형(/join/:joinKey)인 게 계약의 핵심이다
    expect(invite.joinUrl).toBe('/join/Fh1TDIk81EPP')
  })
})

/**
 * 초대 링크 재진입 감지(02-1) — 목록엔 joinKey가 없어(시크릿 미노출) 모임마다 초대 정보를 조회해 대조한다.
 * 타입이 못 보는 규칙: **조회 실패를 '비멤버'로 단정하지 않는다.** 일시 오류로 "이미 멤버인데
 * 비번 모달을 다시 띄우는" 오판을 막는 게 이 함수의 존재 이유다.
 */
describe('findMyGroupByJoinKey', () => {
  const inviteOf = (joinKey: string) => envelope({ ...BE_GROUP_INVITE, joinKey })
  const serverError = () => jsonResponse(errorEnvelope('COMMON500', '서버 오류입니다.'), 500)

  /** 내 모임 2개(6·5)와 모임별 invite 응답을 라우팅한다 */
  function stubInvites(invites: Record<number, () => Response>) {
    return stubFetch((call) => {
      if (call.url === '/api/v1/groups') {
        return jsonResponse(
          envelope([
            { ...BE_GROUP_SUMMARY, groupId: 6 },
            { ...BE_GROUP_SUMMARY, groupId: 5 },
          ]),
        )
      }
      const match = /^\/api\/v1\/groups\/(\d+)\/invite$/.exec(call.url)
      if (match) return invites[Number(match[1])]()
      throw new Error(`예상하지 못한 요청: ${call.url}`)
    })
  }

  it('joinKey가 내 모임의 것이면 그 모임을 돌려준다', async () => {
    stubInvites({
      6: () => jsonResponse(inviteOf('K6')),
      5: () => jsonResponse(inviteOf('K5')),
    })

    const group = await findMyGroupByJoinKey('K6')
    expect(group?.id).toBe(6)
  })

  it('전부 조회에 성공했는데 매치가 없으면 확실한 비멤버 — 재시도하지 않는다', async () => {
    const calls = stubInvites({
      6: () => jsonResponse(inviteOf('K6')),
      5: () => jsonResponse(inviteOf('K5')),
    })

    await expect(findMyGroupByJoinKey('남의모임키')).resolves.toBeNull()
    expect(calls.filter((c) => c.url.endsWith('/invite'))).toHaveLength(2)
  })

  it('일시 오류로 판정 못 한 모임은 한 번 더 조회한다 — 실패를 비멤버로 단정하지 않는다', async () => {
    let attempts = 0
    stubInvites({
      6: () => (++attempts === 1 ? serverError() : jsonResponse(inviteOf('K6'))),
      5: () => jsonResponse(inviteOf('K5')),
    })

    const group = await findMyGroupByJoinKey('K6')
    expect(group?.id).toBe(6)
    expect(attempts).toBe(2)
  })

  it('재시도도 실패하면 null로 폴백한다 — 참여 자체를 막지는 않는다', async () => {
    stubInvites({ 6: serverError, 5: serverError })
    await expect(findMyGroupByJoinKey('K6')).resolves.toBeNull()
  })
})

describe('이벤트', () => {
  it('BE 상세 — 대문자 enum·eventDate·thumbnailPhotoId를 FE 계약으로 옮긴다', async () => {
    serve(envelope(BE_EVENT_DETAIL))

    await expect(getEvent(4)).resolves.toEqual({
      id: 4,
      groupId: 6,
      name: '업로드 3단계 검증',
      date: '2026-07-10',
      status: 'analyzing',
      photoCount: 0,
      albumCount: 0,
      createdAt: '2026-07-10T03:33:06.413658Z',
      publishedAt: null,
      coverPhotoId: null,
      // progress 필드가 없던 채집분 — 매퍼가 null로 채운다(CHMO-287 전 BE와의 호환)
      progress: null,
    })
  })

  it('BE 분석 진행률(progress)은 그대로 통과한다 — 분석중 화면 쥐→치즈 프로그레스의 원천 (CHMO-287)', async () => {
    serve(envelope(BE_EVENT_DETAIL_WITH_PROGRESS))
    const event = await getEvent(42)
    expect(event.progress).toEqual({ processed: 9, total: 20, percent: 45 })
    // 채집 당시 두 번째 job — status와 progress는 독립이라 REVIEW인 채로도 올 수 있다
    expect(event.status).toBe('review')
  })

  it('BE PUBLISHED는 소문자 published가 된다 — 05 배지·뷰어 노출의 분기 기준', async () => {
    serve(envelope(BE_EVENT_PUBLISHED))
    const event = await getEvent(7)
    expect(event.status).toBe('published')
    expect(event.coverPhotoId).toBe(101)
  })

  it('BE 생성 응답의 오프셋 없는 createdAt에 Z가 붙는다 (CHMO-205 전 FE 보정)', async () => {
    const calls = serve(envelope(BE_EVENT_CREATED, 'COMMON201'), 201)

    const event = await createEvent(6, { name: '업로드 3단계 검증' })

    expect(calls[0].url).toBe('/api/v1/groups/6/events')
    expect(bodyOf(calls[0])).toEqual({ name: '업로드 3단계 검증' })
    expect(event.createdAt).toBe('2026-07-10T03:33:06.41365825Z')
    expect(event.status).toBe('empty')
  })

  it('BE bare 배열 목록 — 상세와 달리 groupId가 없다', async () => {
    serve(envelope([BE_EVENT_SUMMARY]))
    const events = await listGroupEvents(6)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ id: 4, date: '2026-07-10', status: 'analyzing' })
    expect(events[0].groupId).toBeUndefined()
  })
})

describe('앨범 · 사진', () => {
  it('BE 앨범 목록 — 대문자 type을 내리고, 특수 앨범 표시명을 type에서 파생한다', async () => {
    serve(envelope([BE_ALBUM_PERSON, BE_ALBUM_COMMON, BE_ALBUM_EYES_CLOSED]))

    const albums = await listEventAlbums(4)

    expect(albums[0]).toMatchObject({
      id: 11,
      type: 'person',
      personId: 7,
      name: '지민',
      unreviewedPhotoCount: 3,
      coverPhotoId: 101,
      visibleToViewer: true,
    })
    expect(albums[1]).toMatchObject({ type: 'common', name: '공통', visibleToViewer: true })
    // BE는 personName이 null일 뿐 표시명을 주지 않는다 — 라벨 원천은 lib/albumLabels.ts
    expect(albums[2]).toMatchObject({
      id: 14,
      type: 'eyes_closed',
      personId: null,
      name: '눈감은 사진',
      coverPhotoId: null,
      coverThumbnailUrl: null,
      // 뷰어 노출 여부도 BE엔 없다 — person/common만 true로 파생
      visibleToViewer: false,
    })
  })

  it('BE 앨범 상세 — photos가 내장돼 있고 eyesClosed/blurry가 평면 필드다', async () => {
    serve(envelope(BE_ALBUM_DETAIL))

    const { album, photos } = await getAlbumWithPhotos(11)

    expect(album).toMatchObject({ id: 11, type: 'person', name: '지민', photoCount: 1 })
    expect(photos[0]).toMatchObject({
      id: 101,
      albumIds: [11, 14],
      // BE엔 원본 url 필드가 없다 — downloadUrl이 원본 겸 다운로드
      url: BE_ALBUM_DETAIL.photos[0].downloadUrl,
      downloadUrl: BE_ALBUM_DETAIL.photos[0].downloadUrl,
      flags: { eyesClosed: true, blurry: false },
      reviewed: false,
    })
  })

  it('멤버 zip 다운로드 — 경로는 평면 /albums/:id/download, 멤버 토큰을 쓴다(CHMO-338)', async () => {
    const calls = serve(envelope(BE_MEMBER_ZIP))

    await expect(getAlbumZip(279)).resolves.toEqual({
      downloadUrl: BE_MEMBER_ZIP.downloadUrl,
      // 실서버가 Z를 붙여 주는 케이스 — 보정이 이중으로 붙지 않아야 한다
      expiresAt: '2026-07-20T07:11:37.636027303Z',
    })
    expect(calls[0].url).toBe('/api/v1/albums/279/download')
    expect(calls[0].headers.get('Authorization')).toBe('Bearer at')
  })

  it('앨범 검토 완료 — 서버는 reviewStatus enum으로 받는다(검토 상태는 사진 단위 일괄 갱신)', async () => {
    const calls = serve(envelope(BE_ALBUM_PERSON))

    await markAlbumReviewed(11)

    expect(calls[0].url).toBe('/api/v1/albums/11')
    expect(calls[0].method).toBe('PATCH')
    expect(bodyOf(calls[0])).toEqual({ reviewStatus: 'REVIEWED' })
  })

  it('BE 이동 추천 — 공통 판정은 type(이름·유사도 없는 인물이 공통으로 새지 않는다, CHMO-399)', async () => {
    const calls = serve(
      envelope([BE_MOVE_SUGGESTION_PERSON, BE_MOVE_SUGGESTION_UNNAMED_PERSON, BE_MOVE_SUGGESTION_COMMON]),
    )

    const suggestions = await getMoveSuggestions(11, [101, 102])

    expect(calls[0].url).toBe('/api/v1/albums/11/move-suggestions?photoIds=101,102')
    expect(suggestions).toEqual([
      {
        albumId: 12,
        name: '서준',
        isCommon: false,
        similarity: 0.82,
        thumbnailUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/thumbs/105.jpg',
      },
      {
        albumId: 14,
        name: '이름 없음',
        isCommon: false,
        similarity: null,
        thumbnailUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/thumbs/106.jpg',
      },
      { albumId: 13, name: '공통', isCommon: true, similarity: null, thumbnailUrl: null },
    ])
  })

  it('이동 — 요청 본문과 movedCount 응답', async () => {
    const calls = serve(envelope(BE_MOVE_PHOTOS))

    const result = await movePhotos({
      photoIds: [101, 102, 103],
      sourceAlbumId: 11,
      targetAlbumId: 12,
    })

    expect(calls[0].url).toBe('/api/v1/photos/move')
    expect(bodyOf(calls[0])).toEqual({
      photoIds: [101, 102, 103],
      sourceAlbumId: 11,
      targetAlbumId: 12,
    })
    expect(result).toEqual({ movedCount: 3 })
  })

  it('BE 삭제 — 연결 해제와 완전 삭제를 구분해 준다', async () => {
    const calls = serve(envelope(BE_DELETE_PHOTOS))

    const result = await deletePhotos({ albumId: 11, photoIds: [101, 102] })

    expect(calls[0].method).toBe('DELETE')
    expect(bodyOf(calls[0])).toEqual({ albumId: 11, photoIds: [101, 102] })
    expect(result).toEqual({ detachedCount: 2, deletedPhotoCount: 1 })
  })
})

describe('공개 전 검수 요약 (14)', () => {
  it('미리보기 앨범은 BE albums[]에서 파생한다 — 뷰어 노출(person/common)만 (CHMO-346)', async () => {
    serve(envelope(BE_REVIEW_SUMMARY))

    const summary = await getReviewSummary(4)

    // 검토 진척은 앨범 단위 파생(CHMO-357): person(미검토 3장)·common(전량 검토)만 세고
    // eyes_closed는 미검토여도 제외 — BE reviewedAlbums(1)/unreviewedAlbums(2)와 다른 값이 맞다
    expect(summary).toMatchObject({
      photoCount: 19,
      albumCount: 3,
      reviewedAlbumCount: 1,
      reviewableAlbumCount: 2,
    })
    // person·common만 — 특수 앨범(eyes_closed)은 뷰어 비노출이라 빠진다.
    // 앨범 카드가 쓰는 이름·검토 수치·커버까지 매핑돼 온다
    expect(summary.previewAlbums).toHaveLength(2)
    expect(summary.previewAlbums[0]).toMatchObject({
      id: 11,
      type: 'person',
      name: '지민',
      photoCount: 12,
      unreviewedPhotoCount: 3,
      coverThumbnailUrl: BE_ALBUM_PERSON.thumbnailUrl,
    })
    expect(summary.previewAlbums[1]).toMatchObject({ id: 13, type: 'common', name: '공통' })
  })

  it('앨범 카드 그리드는 상한 없이 전량 — 커버 없는 앨범도 카드로 나온다 (CHMO-346, 6장 캡 제거)', async () => {
    const albums = Array.from({ length: 8 }, (_, i) => ({
      ...BE_ALBUM_PERSON,
      albumId: 20 + i,
      thumbnailPhotoId: null,
      thumbnailUrl: null,
    }))
    serve(envelope({ ...BE_REVIEW_SUMMARY, albums }))

    const summary = await getReviewSummary(4)
    expect(summary.previewAlbums).toHaveLength(8)
  })

  it('전 사진 미검토면 미리보기가 빈다 — 미검토 앨범을 "보일 앨범"으로 담지 않는다 (CHMO-233)', async () => {
    const albums = [
      { ...BE_ALBUM_PERSON, unreviewedPhotoCount: BE_ALBUM_PERSON.photoCount },
      { ...BE_ALBUM_COMMON, unreviewedPhotoCount: BE_ALBUM_COMMON.photoCount },
      BE_ALBUM_EYES_CLOSED,
    ]
    serve(envelope({ ...BE_REVIEW_SUMMARY, reviewedPhotoCount: 0, albums }))

    const summary = await getReviewSummary(4)
    expect(summary.previewAlbums).toEqual([])
    // 사진은 있는데 전부 미검토 — 검토한 앨범 0/2 (사진 0장 공허 완료와 구분, CHMO-357)
    expect(summary.reviewedAlbumCount).toBe(0)
    expect(summary.reviewableAlbumCount).toBe(2)
  })
})

describe('업로드 3단계 (06-U)', () => {
  it('① presign — 파일 메타만 보내고 bare 배열로 업로드 URL을 받는다', async () => {
    const calls = serve(envelope([BE_PRESIGN_UPLOAD]))

    const uploads = await presignUploads(4, [{ fileName: 'a.JPG', size: 123456 }])

    expect(calls[0].url).toBe('/api/v1/events/4/photos/presign')
    expect(calls[0].method).toBe('POST')
    // contentType은 요청에 담지 않는다 — BE가 fileName 확장자로 정한다
    expect(bodyOf(calls[0])).toEqual({ files: [{ fileName: 'a.JPG', size: 123456 }] })
    expect(uploads).toEqual([BE_PRESIGN_UPLOAD])
  })

  it('② S3 PUT — Content-Type이 서명값과 정확히 같아야 한다 (아니면 403 SignatureDoesNotMatch)', async () => {
    const calls = stubFetch(() => emptyResponse(200))
    const file = new File(['bytes'], 'a.JPG', { type: 'image/jpeg' })

    await uploadToPresignedUrl(BE_PRESIGN_UPLOAD, file)

    // apiFetch를 타지 않는다 — /api/v1 프리픽스도 Authorization도 붙으면 안 된다
    expect(calls[0].url).toBe(BE_PRESIGN_UPLOAD.uploadUrl)
    expect(calls[0].method).toBe('PUT')
    expect(calls[0].headers.get('Content-Type')).toBe(BE_PRESIGN_UPLOAD.contentType)
    expect(calls[0].headers.has('Authorization')).toBe(false)
    expect(calls[0].rawBody).toBe(file)
  })

  it('② S3 PUT 실패는 UPLOAD_FAILED — presign 만료의 403이 세션 만료로 오인되면 안 된다', async () => {
    stubFetch(() => emptyResponse(403))
    const file = new File(['bytes'], 'a.JPG', { type: 'image/jpeg' })

    await expect(uploadToPresignedUrl(BE_PRESIGN_UPLOAD, file)).rejects.toMatchObject({
      status: 403,
      code: 'UPLOAD_FAILED',
    })
  })

  it('③ 등록 — 품질 제외 옵션이 analyze가 아니라 등록에 실린다(등록이 곧 분석 시작)', async () => {
    const calls = serve(envelope(BE_REGISTER_PHOTOS, 'COMMON201'), 201)

    const result = await registerPhotos(4, {
      s3Keys: [BE_PRESIGN_UPLOAD.s3Key],
      excludeEyesClosed: true,
      excludeBlurry: false,
    })

    expect(calls[0].url).toBe('/api/v1/events/4/photos')
    expect(bodyOf(calls[0])).toEqual({
      s3Keys: [BE_PRESIGN_UPLOAD.s3Key],
      excludeEyesClosed: true,
      excludeBlurry: false,
    })
    expect(result).toEqual({ jobId: BE_REGISTER_PHOTOS.jobId, registeredCount: 2 })
  })
})

describe('학부모 뷰어', () => {
  it('BE 잠금 해제 — 모임명은 이 응답에만 온다', async () => {
    serve(envelope(BE_VIEWER_UNLOCK))
    await expect(unlockViewer(SHARE_TOKEN, '3435')).resolves.toEqual({
      viewerToken: '<viewer-jwt>',
      groupId: 6,
      groupName: 'CHMO-194 업로드검증',
    })
  })

  it('BE 공개 이벤트 목록은 bare 배열 — 모임명은 unlock 때 캐시한 값을 쓴다', async () => {
    setViewerGroupName(SHARE_TOKEN, '치즈반')
    serve(envelope([BE_EVENT_SUMMARY]))

    const { groupName, events } = await getViewerEvents(SHARE_TOKEN)

    expect(groupName).toBe('치즈반')
    expect(events[0]).toEqual({
      id: 4,
      name: '업로드 3단계 검증',
      date: '2026-07-10',
      photoCount: 0,
      albumCount: 0,
      coverPhotoId: null,
      coverThumbnailUrl: null,
      publishedAt: null,
    })
  })

  it('캐시된 모임명이 없으면 빈 문자열 — 목록 응답엔 모임명이 없다', async () => {
    serve(envelope([BE_EVENT_SUMMARY]))
    await expect(getViewerEvents(SHARE_TOKEN)).resolves.toMatchObject({ groupName: '' })
  })

  it('BE 앨범 목록은 eventName이 평면 필드다', async () => {
    serve(envelope(BE_VIEWER_ALBUMS))

    const { eventName, albums } = await getViewerAlbums(SHARE_TOKEN, 4)

    expect(eventName).toBe('업로드 3단계 검증')
    expect(albums).toEqual([
      {
        id: 11,
        type: 'person',
        name: '지민',
        photoCount: 12,
        coverPhotoId: 101,
        coverThumbnailUrl: BE_ALBUM_PERSON.thumbnailUrl,
      },
      {
        id: 13,
        type: 'common',
        name: '공통',
        photoCount: 5,
        coverPhotoId: 105,
        coverThumbnailUrl: BE_ALBUM_COMMON.thumbnailUrl,
      },
    ])
  })

  it('BE 사진 그리드 — type 없이 personName만 온다. null이면 공통 앨범이다', async () => {
    serve(envelope(BE_VIEWER_ALBUM_PHOTOS_COMMON))

    const { album, photos } = await getViewerAlbumPhotos(SHARE_TOKEN, 4, 13)

    expect(album).toEqual({ id: 13, name: '공통', photoCount: 1 })
    expect(photos[0]).toEqual({
      id: 101,
      // BE ViewerPhotoResponse엔 원본 url이 없다 — downloadUrl이 원본 겸 다운로드
      url: BE_VIEWER_ALBUM_PHOTOS_COMMON.photos[0].downloadUrl,
      thumbnailUrl: BE_VIEWER_ALBUM_PHOTOS_COMMON.photos[0].thumbnailUrl,
      downloadUrl: BE_VIEWER_ALBUM_PHOTOS_COMMON.photos[0].downloadUrl,
    })
  })

  it('BE 사진 그리드 — personName이 있으면 인물 앨범 이름을 그대로 쓴다', async () => {
    serve(envelope(BE_VIEWER_ALBUM_PHOTOS_PERSON))
    const { album } = await getViewerAlbumPhotos(SHARE_TOKEN, 4, 11)
    expect(album).toEqual({ id: 11, name: '지민', photoCount: 1 })
  })

  it('zip 다운로드 — 만료 시각도 오프셋 없이 오므로 Z 보정을 받는다', async () => {
    const calls = serve(envelope(BE_VIEWER_ZIP))

    await expect(getViewerAlbumZip(SHARE_TOKEN, 4, 11)).resolves.toEqual({
      downloadUrl: BE_VIEWER_ZIP.downloadUrl,
      expiresAt: '2026-07-10T04:41:30.123456Z',
    })
    expect(calls[0].url).toBe(`/api/v1/share/${SHARE_TOKEN}/events/4/albums/11/download`)
    expect(calls[0].headers.get('Authorization')).toBe('Bearer vt')
  })
})

describe('인증 · 프로필', () => {
  it('BE AuthResponse의 평면 필드에서 두 토큰만 남긴다', async () => {
    serve(envelope(BE_AUTH))
    await expect(login({ nickname: 'FE연동테스트', pin: '0709' })).resolves.toEqual({
      accessToken: '<access-jwt>',
      refreshToken: '<refresh-token>',
    })
  })

  it('BE 프로필의 userId를 id로 옮긴다', async () => {
    serve(envelope(BE_USER))
    await expect(getMe()).resolves.toEqual({
      id: 4,
      nickname: 'FE연동테스트',
      createdAt: '2026-07-09T09:50:37.543598Z',
    })
  })
})
