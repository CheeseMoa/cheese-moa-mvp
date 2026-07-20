/**
 * 목 직렬화기 ↔ api 매퍼 이음매 (CHMO-195).
 *
 * 검증하는 명제: **"목이 내려주는 DTO를 매퍼가 읽으면 화면이 쓸 값이 나온다."**
 * 목과 매퍼 사이엔 HTTP가 끼어 있어 tsc가 둘을 이어주지 못한다 — 목이 `albumId` 대신 `id`를
 * 주면 매퍼는 undefined를 읽지만 typecheck·lint·build는 전부 통과하고, 브라우저에서야 깨진다.
 *
 * 이 파일이 지키는 건 "내 목과 내 매퍼가 서로 말이 통하는가"뿐이다.
 * "내 매퍼가 **실 BE**와 말이 통하는가"는 실서버 응답 픽스처를 쓰는 `src/api/contracts.test.ts`가
 * 지킨다 — 둘 다 있어야 목/실서버 양쪽(`VITE_ENABLE_MSW` 스위치)이 산다.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  seedDb,
  findAlbum,
  findEvent,
  findGroup,
  db,
  photosOfAlbum,
  photosOfEvent,
  albumsOfEvent,
  personNameOf,
} from './db'
import { createFixtures } from './fixtures'
import {
  toAlbumDetail,
  toAlbumSummary,
  toAnalysisStatusResponse,
  toDeletePhotosResponse,
  toEventDetail,
  toEventSummary,
  toGroupDetail,
  toGroupSummary,
  toMovePhotosResponse,
  toMoveSuggestionResponse,
  toPhotoInAlbum,
  toReviewSummaryResponse,
  toUser as serializeUser,
  toViewerAlbumPhotosResponse,
  toViewerAlbumSummary,
  toViewerEventAlbumsResponse,
  toViewerEventSummary,
  toViewerPhoto as serializeViewerPhoto,
  toViewerUnlockResponse,
} from './handlers/serializers'
import {
  toAlbum,
  toAnalysisJob,
  toEvent,
  toGroup,
  toMoveSuggestion,
  toPhoto,
  toUser,
  toViewerAlbum,
  toViewerEvent,
  toViewerPhoto,
} from '../api/mappers'

beforeEach(() => seedDb(createFixtures()))

describe('목 직렬화기 → api 매퍼 이음매', () => {
  it('유저', () => {
    expect(toUser(serializeUser(db.users[0]))).toEqual({
      id: 1,
      nickname: '이현정',
      createdAt: '2026-06-01T10:00:00+09:00',
    })
  })

  it('모임 — 목록엔 eventCount, 상세엔 없다', () => {
    const group = findGroup(1)!
    expect(toGroup(toGroupSummary(group))).toMatchObject({
      id: 1,
      name: '햇살반',
      memberCount: 3,
      eventCount: 4,
      role: null,
    })
    expect(toGroup(toGroupDetail(group)).eventCount).toBeUndefined()
  })

  it('이벤트 — 대문자 enum이 소문자로, eventDate가 date로', () => {
    const event = findEvent(2)! // 봄 소풍(published)
    const summary = toEvent(toEventSummary(event))
    expect(summary).toMatchObject({ id: 2, name: '봄 소풍', date: '2026-05-12', status: 'published' })
    expect(summary.groupId).toBeUndefined()
    expect(summary.coverPhotoId).toBe(201)

    const detail = toEvent(toEventDetail(event))
    expect(detail).toMatchObject({ id: 2, groupId: 1, status: 'published' })
    expect(detail.publishedAt).toBe('2026-05-14T18:00:00+09:00')
  })

  it('분석 진행률 — 분석중 상세에만 progress, 분석 아니면 null (CHMO-287)', () => {
    // 이벤트 3(여름 물놀이) — 시드 시점부터 분석중, job total 20(미분류 사진 수와 일치)
    const analyzing = toEvent(toEventDetail(findEvent(3)!))
    expect(analyzing.progress).not.toBeNull()
    expect(analyzing.progress!.total).toBe(20)
    expect(analyzing.progress!.percent).toBeGreaterThanOrEqual(0)
    expect(analyzing.progress!.percent).toBeLessThanOrEqual(100)

    // 분석중이 아닌 이벤트(봄 소풍 published) — BE처럼 null
    expect(toEvent(toEventDetail(findEvent(2)!)).progress).toBeNull()
    // 목록(EventSummaryResponse)엔 BE도 progress를 주지 않는다 — 매퍼가 null로 채운다
    expect(toEvent(toEventSummary(findEvent(3)!)).progress).toBeNull()
  })

  it('분석 상태 — 대문자 enum이 소문자로, 이벤트 상태에서 유도', () => {
    // empty → NONE, analyzing → ANALYZING, 그 외(review/published) → DONE
    expect(toAnalysisJob(toAnalysisStatusResponse(findEvent(4)!))).toEqual({
      analysisStatus: 'none',
      eventStatus: 'empty',
    })
    expect(toAnalysisJob(toAnalysisStatusResponse(findEvent(3)!))).toEqual({
      analysisStatus: 'analyzing',
      eventStatus: 'analyzing',
    })
    expect(toAnalysisJob(toAnalysisStatusResponse(findEvent(1)!))).toEqual({
      analysisStatus: 'done',
      eventStatus: 'review',
    })
  })

  it('앨범 요약 — personName이 표시명으로, 특수 앨범은 라벨 파생', () => {
    const person = toAlbum(toAlbumSummary(findAlbum(1)!))
    expect(person).toMatchObject({
      id: 1,
      type: 'person',
      personId: 1,
      name: '김민준',
      visibleToViewer: true,
    })
    expect(person.coverPhotoId).toBe(101)
    expect(person.coverThumbnailUrl).toContain('picsum')
    expect(person.unreviewedPhotoCount).toBe(0)

    const eyesClosed = toAlbum(toAlbumSummary(findAlbum(7)!))
    expect(eyesClosed).toMatchObject({
      type: 'eyes_closed',
      personId: null,
      name: '눈감은 사진',
      visibleToViewer: false,
    })

    const common = toAlbum(toAlbumSummary(findAlbum(5)!))
    expect(common).toMatchObject({ type: 'common', name: '공통', visibleToViewer: true })
  })

  it('앨범 상세 — photos 내장, thumbnail 없음', () => {
    const raw = toAlbumDetail(findAlbum(1)!)
    const album = toAlbum(raw)
    const photos = raw.photos.map(toPhoto)

    expect(album).toMatchObject({ id: 1, name: '김민준' })
    expect(album.coverPhotoId).toBeNull() // 상세 응답엔 thumbnailPhotoId가 없다
    expect(album.unreviewedPhotoCount).toBeUndefined()
    expect(photos.length).toBeGreaterThan(0)
    expect(photos[0]).toMatchObject({
      id: 101,
      reviewed: true,
      flags: { eyesClosed: false, blurry: false },
    })
    expect(photos[0].url).toBe(photos[0].downloadUrl)
    expect(photos[0].albumIds).toContain(1)
  })

  it('사진 — 평면 플래그가 flags 객체로', () => {
    const eyesClosedPhoto = photosOfAlbum(7)[0]
    expect(toPhoto(toPhotoInAlbum(eyesClosedPhoto)).flags).toEqual({
      eyesClosed: true,
      blurry: false,
    })
  })

  it('이동 추천 — 핸들러 항목 직렬화가 매퍼와 맞는다(personName null이면 공통)', () => {
    // 핸들러가 인라인으로 조립하던 항목을 toMoveSuggestionResponse로 승격(CHMO-227)
    // 썸네일은 검수 그리드(AlbumSummary)와 같은 커버 규약(CHMO-232) — 커버가 실재하는지도 확인
    const person = findAlbum(2)!
    const personCover = toAlbumSummary(person).thumbnailUrl
    expect(personCover).not.toBeNull()
    expect(toMoveSuggestion(toMoveSuggestionResponse(person, 0.9))).toEqual({
      albumId: 2,
      name: '이서연',
      similarity: 0.9,
      thumbnailUrl: personCover,
    })
    const common = findAlbum(5)!
    expect(toMoveSuggestion(toMoveSuggestionResponse(common, null))).toEqual({
      albumId: 5,
      name: '공통',
      similarity: null,
      thumbnailUrl: toAlbumSummary(common).thumbnailUrl,
    })
  })

  it('뷰어 — 검토 완료 기준 카운트/커버', () => {
    const event = findEvent(2)! // published, 전 사진 검토 완료
    const viewerEvent = toViewerEvent(toViewerEventSummary(event))
    expect(viewerEvent).toMatchObject({ id: 2, name: '봄 소풍', date: '2026-05-12' })
    expect(viewerEvent.photoCount).toBe(16)
    expect(viewerEvent.albumCount).toBe(4)
    expect(viewerEvent.coverThumbnailUrl).toContain('picsum')
    expect(viewerEvent.publishedAt).toBeNull() // 목록 응답엔 publishedAt이 없다

    const viewerAlbum = toViewerAlbum(toViewerAlbumSummary(findAlbum(9)!))
    expect(viewerAlbum).toMatchObject({ id: 9, type: 'person', name: '김민준' })
    expect(viewerAlbum.coverThumbnailUrl).toContain('picsum')

    const viewerPhoto = toViewerPhoto(serializeViewerPhoto(photosOfAlbum(9)[0]))
    expect(viewerPhoto.url).toBe(viewerPhoto.downloadUrl)
    expect(viewerPhoto.thumbnailUrl).toContain('picsum')
  })

  it('검수 중 이벤트 — 앨범 1만 검토 완료(부분 검수 상태)', () => {
    const albums = db.albums.filter((a) => a.eventId === 1).map((a) => toAlbum(toAlbumSummary(a)))
    expect(albums.find((a) => a.id === 1)!.unreviewedPhotoCount).toBe(0)
    expect(albums.find((a) => a.id === 2)!.unreviewedPhotoCount).toBeGreaterThan(0)
  })
})

/**
 * 예전엔 핸들러가 객체 리터럴로 그 자리에서 조립하던 응답들 (CHMO-227).
 * export된 직렬화 함수만 왕복하던 이음매 테스트의 사각지대라, 여기서 필드명 오타
 * (totalPhotos→totalPhoto 등)가 나도 npm run test가 초록이고 MSW 모드에서만 조용히 깨졌다.
 * serializers.ts 함수로 승격해 소비처(api/*.ts)가 읽는 필드명을 여기서 고정한다.
 */
describe('인라인 조립 응답 → 소비처 필드명 이음매 (CHMO-227)', () => {
  it('검수 요약 — getReviewSummary가 읽는 스칼라·albums 필드명', () => {
    const event = findEvent(1)! // review 상태 — 앨범·사진 보유
    const raw = toReviewSummaryResponse(event)
    expect(raw.totalPhotos).toBe(photosOfEvent(1).length)
    expect(raw.totalAlbums).toBe(albumsOfEvent(1).length)
    expect(raw.reviewedPhotoCount).toBe(photosOfEvent(1).filter((p) => p.reviewed).length)
    expect(typeof raw.uncertainCount).toBe('number')
    // albums는 AlbumSummaryResponse[] — 매퍼가 그대로 읽어 화면 카드가 된다
    expect(raw.albums.map(toAlbum)[0]).toMatchObject({
      id: expect.any(Number),
      name: expect.any(String),
    })
  })

  it('사진 이동 응답 — movedCount 필드명', () => {
    expect(toMovePhotosResponse([101, 102, 103])).toEqual({ movedCount: 3 })
  })

  it('사진 제거 응답 — detached(연결 해제)/deleted(폐기) 구분 필드명', () => {
    // 존재하는 id는 detach만, 없는 id는 마지막 연결 폐기로 집계된다
    const existing = photosOfAlbum(1)[0].id
    expect(toDeletePhotosResponse([existing, 999999])).toEqual({
      detachedCount: 2,
      deletedPhotoCount: 1,
    })
  })

  it('뷰어 잠금해제 — viewerToken·groupId·groupName 필드명', () => {
    expect(toViewerUnlockResponse(findGroup(1)!, 'tok')).toEqual({
      viewerToken: 'tok',
      groupId: 1,
      groupName: '햇살반',
    })
  })

  it('뷰어 이벤트 앨범 — eventId·eventName 평면 필드 + albums 매핑', () => {
    const raw = toViewerEventAlbumsResponse(findEvent(2)!) // published
    expect(raw.eventId).toBe(2)
    expect(raw.eventName).toBe('봄 소풍')
    expect(raw.albums.map(toViewerAlbum)[0]).toMatchObject({ id: expect.any(Number) })
  })

  it('뷰어 앨범 사진 — albumId·personName·photos 필드', () => {
    const album = findAlbum(9)! // published 이벤트의 인물 앨범
    const raw = toViewerAlbumPhotosResponse(album)
    expect(raw.albumId).toBe(9)
    expect(raw.personName).toBe(personNameOf(album))
    expect(raw.photos.map(toViewerPhoto)[0]).toMatchObject({ id: expect.any(Number) })
  })
})
