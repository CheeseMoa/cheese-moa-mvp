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
import { seedDb, findAlbum, findEvent, findGroup, db, photosOfAlbum, personNameOf } from './db'
import { createFixtures } from './fixtures'
import {
  toAlbumDetail,
  toAlbumSummary,
  toEventDetail,
  toEventSummary,
  toGroupDetail,
  toGroupSummary,
  toPhotoInAlbum,
  toUser as serializeUser,
  toViewerAlbumSummary,
  toViewerEventSummary,
  toViewerPhoto as serializeViewerPhoto,
} from './handlers/serializers'
import {
  toAlbum,
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

  it('이동 추천 — personName null이면 공통', () => {
    expect(
      toMoveSuggestion({ albumId: 2, personName: personNameOf(findAlbum(2)!), similarity: 0.9 }),
    ).toEqual({ albumId: 2, name: '이서연', similarity: 0.9 })
    expect(toMoveSuggestion({ albumId: 5, personName: null, similarity: null })).toEqual({
      albumId: 5,
      name: '공통',
      similarity: null,
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
