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
  findPhoto,
  db,
  createManualPersonAlbum,
  deleteAlbumCascade,
  membershipOf,
  photosOfAlbum,
  photosOfEvent,
  albumsOfEvent,
  personNameOf,
  pendingPublishCountOf,
  publishEventPhotos,
  unlinkPhotoFromAlbum,
  unreviewedGatePhotoCount,
} from './db'
import { createFixtures } from './fixtures'
import {
  toAlbumDetail,
  toAlbumSummary,
  toCreateAlbumResponse,
  toAnalysisStatusResponse,
  toDeletePhotosResponse,
  toEventDetail,
  toEventSummary,
  toGroupDetail,
  toGroupMemberResponse,
  toGroupSummary,
  toJoinGroupResponse,
  toJoinRequestResponse,
  toMovePhotosResponse,
  toMoveSuggestionResponse,
  toParentEventPhotosResponse,
  toParentEventSummary,
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
  toGroupMember,
  toJoinGroupResult,
  toJoinRequest,
  toMoveSuggestion,
  toParentEventPhotos,
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

  it('모임 — 목록엔 eventCount, 상세엔 없다 (선생님 시점)', () => {
    const group = findGroup(1)!
    const teacher = membershipOf(1, 1)! // 이현정 — 햇살반 ACTIVE TEACHER
    expect(toGroup(toGroupSummary(group, teacher))).toMatchObject({
      id: 1,
      name: '햇살반',
      // ACTIVE 멤버만(선생님 3 + 학부모 3) — 대기 신청(치즈냥이88)은 세지 않는다
      memberCount: 6,
      eventCount: 4,
      myMembership: { role: 'teacher', status: 'active', claimedChildNames: [] },
    })
    const detail = toGroup(toGroupDetail(group, teacher))
    expect(detail.eventCount).toBeUndefined()
    // 카운트 분리(§7-3) — 상세는 teacherCount/parentCount를 준다(memberCount는 과도기 병행)
    expect(detail).toMatchObject({ teacherCount: 3, parentCount: 3, memberCount: 6 })
  })

  it('모임 — PARENT·PENDING 응답엔 멤버 정보가 없다 (§7-3 미노출)', () => {
    const group = findGroup(1)!

    // ACTIVE PARENT(민준아빠) — 목록에 멤버 수 없음, eventCount는 published 수만(미공개 존재 은닉)
    // linkedChildNames는 §4 매핑 파생(CHMO-448) — 민준아빠는 인물 1(김민준)에 연결돼 있다
    const parent = toGroup(toGroupSummary(group, membershipOf(4, 1)!))
    expect(parent.myMembership).toEqual({
      role: 'parent',
      status: 'active',
      claimedChildNames: ['김민준'],
      linkedChildNames: ['김민준'],
    })
    expect(parent.memberCount).toBeUndefined()
    expect(parent.eventCount).toBe(1) // 봄 소풍(published + 김민준 등장)뿐
    // 상세도 멤버 관련 필드 전부 생략
    const parentDetail = toGroup(toGroupDetail(group, membershipOf(4, 1)!))
    expect(parentDetail.memberCount).toBeUndefined()
    expect(parentDetail.teacherCount).toBeUndefined()

    // 미연결(지호네) — 아이 등장 이벤트만 세므로(CHMO-448 노출 강화) published가 있어도 0
    const unlinked = toGroup(toGroupSummary(group, membershipOf(6, 1)!))
    expect(unlinked.eventCount).toBe(0)

    // PENDING(치즈냥이88) — 신청 원문만 실린다(홈 비활성 카드 §7-2). 승인 전엔 매핑이 없어 연결도 빈 배열
    const pending = toGroup(toGroupSummary(group, membershipOf(7, 1)!))
    expect(pending.myMembership).toEqual({
      role: 'parent',
      status: 'pending',
      claimedChildNames: ['김민준'],
      linkedChildNames: [],
    })
    expect(pending.memberCount).toBeUndefined()
    // 대기 항목은 멤버 수를 생략하되 이벤트 수는 0으로 준다(CHMO-475 실 BE 계약) —
    // 카드가 이 0을 "이벤트 0개"로 그리지 않는 건 화면(GroupCard) 몫이다
    expect(pending.eventCount).toBe(0)

    // 선생님 신청도 같은 대기 항목이다(CHMO-475 — 키는 신청 자격만 정한다):
    // 자녀 이름이 없고(claimedChildNames 빈 배열) 멤버 수는 없고 이벤트 수는 0
    const pendingTeacher = { ...membershipOf(1, 1)!, status: 'pending' as const }
    const pendingTeacherSummary = toGroup(toGroupSummary(group, pendingTeacher))
    expect(pendingTeacherSummary.myMembership).toEqual({
      role: 'teacher',
      status: 'pending',
      claimedChildNames: [],
      linkedChildNames: [],
    })
    expect(pendingTeacherSummary.memberCount).toBeUndefined()
    expect(pendingTeacherSummary.eventCount).toBe(0)

    // 승인 전(PENDING)이면 role이 teacher여도 상세 카운트를 주지 않는다 — 목록과 게이트 동일
    const pendingTeacherDetail = toGroupDetail(group, pendingTeacher)
    expect('memberCount' in pendingTeacherDetail).toBe(false)
    expect('teacherCount' in pendingTeacherDetail).toBe(false)
  })

  it('학부모 이벤트 목록 — 카운트·커버가 노출 사진 기준이다 (미발행 누출 방지, Q4)', () => {
    const event = findEvent(2)! // 봄 소풍(published) — 발행 16장 + 발행 대기 4장
    const raw = toParentEventSummary(event, 4) // 민준아빠 — 김민준(앨범 9) 매핑
    const visibleCount = new Set(
      [...photosOfAlbum(9), ...photosOfAlbum(12)]
        .filter((p) => p.reviewed && p.published)
        .map((p) => p.id),
    ).size
    expect(raw.photoCount).toBe(visibleCount) // 발행 대기 4장(217~220)은 세지 않는다
    expect(raw.albumCount).toBe(2) // 김민준 + 공통 — 매핑 안 된 인물 앨범은 세지 않는다
    // 커버는 노출 사진에서만 — 미발행 사진이 썸네일로 새면 안 된다
    expect(raw.thumbnailUrl).toContain('picsum')
    expect(findPhoto(raw.thumbnailPhotoId!)!.published).toBe(true)
    // 제작자와 같은 EventSummaryResponse 형태 — 매퍼가 그대로 읽는다
    expect(toEvent(raw)).toMatchObject({ id: 2, status: 'published', photoCount: visibleCount })
  })

  it('합류 신청 — joinGroup 응답·신청 목록이 매퍼와 맞는다 (초안 §3)', () => {
    const group = findGroup(1)!
    const request = membershipOf(7, 1)! // 치즈냥이88 — PENDING 신청
    expect(toJoinGroupResult(toJoinGroupResponse(group, request))).toEqual({
      groupId: 1,
      groupName: '햇살반',
      role: 'parent',
      status: 'pending',
    })

    const mapped = toJoinRequest(toJoinRequestResponse(request, db.users.find((u) => u.id === 7)!))
    expect(mapped).toEqual({
      id: 9,
      userId: 7,
      nickname: '치즈냥이88',
      role: 'parent',
      childNames: ['김민준'],
      createdAt: '2026-07-25T09:10:00+09:00',
    })

    // 선생님 신청은 childNames 키 자체가 없다(초안 — 생략 가능) → 매퍼가 빈 배열로 정규화
    const teacherRaw = toJoinRequestResponse(membershipOf(1, 1)!, db.users[0])
    expect('childNames' in teacherRaw).toBe(false)
    expect(toJoinRequest(teacherRaw).childNames).toEqual([])
  })

  it('멤버 목록 — 신청 원문 보존·매핑 포함이 매퍼와 맞는다 (초안 §4)', () => {
    // 민준아빠(4) — 연결됨: mappings에 인물 이름이 실린다
    const linked = toGroupMember(
      toGroupMemberResponse(membershipOf(4, 1)!, db.users.find((u) => u.id === 4)!),
    )
    expect(linked).toEqual({
      userId: 4,
      nickname: '민준아빠',
      role: 'parent',
      childNames: ['김민준'],
      mappings: [{ personId: 1, personName: '김민준' }],
    })

    // 지호네(6) — 승인됐지만 미연결(매핑 0건 = 기본 경로 §2): 신청 원문이 보존돼 있다
    const unlinked = toGroupMember(
      toGroupMemberResponse(membershipOf(6, 1)!, db.users.find((u) => u.id === 6)!),
    )
    expect(unlinked.childNames).toEqual(['박지호'])
    expect(unlinked.mappings).toEqual([])

    // 선생님 항목 — childNames·mappings 생략 → 빈 배열 정규화
    const teacher = toGroupMember(toGroupMemberResponse(membershipOf(1, 1)!, db.users[0]))
    expect(teacher).toEqual({
      userId: 1,
      nickname: '이현정',
      role: 'teacher',
      childNames: [],
      mappings: [],
    })
  })

  it('학부모 사진 — 매핑 인물+공통, 노출(reviewed && published)만, 미연결은 공통만 (초안 §5)', () => {
    const event = findEvent(2)! // 봄 소풍(published) — 발행 16장 + 발행 대기 4장(김민준 앨범)

    // 민준아빠(4) — 김민준(인물 1, 앨범 9) 매핑: 김민준 발행분 + 공통 발행분, 발행 대기 4장 제외
    const raw = toParentEventPhotosResponse(event, 4)
    expect(raw.eventId).toBe(2)
    expect(raw.eventName).toBe('봄 소풍')
    const expectedIds = new Set(
      [...photosOfAlbum(9), ...photosOfAlbum(12)]
        .filter((p) => p.reviewed && p.published)
        .map((p) => p.id),
    )
    expect(new Set(raw.photos.map((p) => p.photoId))).toEqual(expectedIds)

    // 매퍼 왕복 — url이 원본 겸 다운로드가 된다
    const photos = toParentEventPhotos(raw).photos
    expect(photos[0].url).toBe(photos[0].downloadUrl)
    expect(photos[0].thumbnailUrl).toContain('picsum')

    // 지호네(6) — 미연결(매핑 0건): 공통 앨범 발행분만
    const commonOnly = toParentEventPhotosResponse(event, 6)
    const commonIds = new Set(
      photosOfAlbum(12)
        .filter((p) => p.reviewed && p.published)
        .map((p) => p.id),
    )
    expect(new Set(commonOnly.photos.map((p) => p.photoId))).toEqual(commonIds)
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
    // 발행 대기(구 CHMO-324) — 상세 전용 필드는 남지만 값은 항상 0이다(CHMO-488):
    // 전량 검토라야 공개되고 공개 후 사진 추가도 없어 대기가 생길 경로가 없다
    expect(detail.pendingPublishCount).toBe(0)
    expect(summary.pendingPublishCount).toBeUndefined()

    // 05 카드 커버(CHMO-515) — 목록에만 오고 상세엔 없다(BE와 같은 비대칭)
    expect(summary.coverThumbnailUrl).toContain('picsum')
    expect(detail.coverThumbnailUrl).toBeNull()

    // 사진 0장 이벤트(가을 발표회 준비)는 커버가 없다 — 카드가 컴팩트로 그려지는 근거
    const emptyEvent = toEvent(toEventSummary(findEvent(4)!))
    expect(emptyEvent.photoCount).toBe(0)
    expect(emptyEvent.coverThumbnailUrl).toBeNull()
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

  it("'분류가 어려워요' 사진 — faceBboxes·causes가 왕복하고, 그 외 사진은 키 생략 → 빈 배열(CHMO-412)", () => {
    // 시드 uncertain 앨범(6)의 사진은 bbox·사유를 갖는다(fixtures가 assignUncertainDetails로 부여)
    const uncertainPhoto = photosOfAlbum(6)[0]
    const raw = toPhotoInAlbum(uncertainPhoto)
    const mapped = toPhoto(raw)
    expect(mapped.faceBboxes).toEqual(uncertainPhoto.faceBboxes)
    expect(mapped.faceBboxes.length).toBeGreaterThan(0)
    expect(mapped.causes).toEqual(uncertainPhoto.causes)

    // 일반 사진은 BE @JsonInclude(NON_EMPTY)처럼 키 자체가 없어야 한다 — 매퍼가 빈 배열로 정규화
    const normalRaw = toPhotoInAlbum(photosOfAlbum(1)[0])
    expect('faceBboxes' in normalRaw).toBe(false)
    expect('causes' in normalRaw).toBe(false)
    expect(toPhoto(normalRaw)).toMatchObject({ faceBboxes: [], causes: [] })
  })

  it('이동 추천 — 핸들러 항목 직렬화가 매퍼와 맞는다(공통 판정은 type, CHMO-399)', () => {
    // 핸들러가 인라인으로 조립하던 항목을 toMoveSuggestionResponse로 승격(CHMO-227)
    // 썸네일은 검수 그리드(AlbumSummary)와 같은 커버 규약(CHMO-232) — 커버가 실재하는지도 확인
    const person = findAlbum(2)!
    const personCover = toAlbumSummary(person).thumbnailUrl
    expect(personCover).not.toBeNull()
    expect(toMoveSuggestion(toMoveSuggestionResponse(person, 0.9))).toEqual({
      albumId: 2,
      name: '이서연',
      isCommon: false,
      similarity: 0.9,
      thumbnailUrl: personCover,
    })
    const common = findAlbum(5)!
    expect(toMoveSuggestion(toMoveSuggestionResponse(common, null))).toEqual({
      albumId: 5,
      name: '공통',
      isCommon: true,
      similarity: null,
      thumbnailUrl: toAlbumSummary(common).thumbnailUrl,
    })
    // 이름 없는 인물(persons에 미등록) — personName·similarity가 null이어도 '이름 없음'(CHMO-399)
    const unnamed = { ...person, personId: 9999 }
    expect(toMoveSuggestion(toMoveSuggestionResponse(unnamed, null)).name).toBe('이름 없음')
  })

  it('뷰어 — 발행(published) 기준 카운트/커버 (CHMO-324)', () => {
    const event = findEvent(2)! // published, 발행 16장 + 발행 대기 4장(217~220)
    const viewerEvent = toViewerEvent(toViewerEventSummary(event))
    expect(viewerEvent).toMatchObject({ id: 2, name: '봄 소풍', date: '2026-05-12' })
    expect(viewerEvent.photoCount).toBe(16) // 발행 대기 4장은 발행 전이라 제외
    expect(viewerEvent.albumCount).toBe(4)
    expect(viewerEvent.coverThumbnailUrl).toContain('picsum')
    expect(viewerEvent.publishedAt).toBeNull() // 목록 응답엔 publishedAt이 없다

    // 김민준 앨범(9)엔 발행 대기 4장이 붙어 있다 — 앨범 카운트·사진 목록도 발행분만
    const viewerAlbum = toViewerAlbum(toViewerAlbumSummary(findAlbum(9)!))
    expect(viewerAlbum).toMatchObject({ id: 9, type: 'person', name: '김민준' })
    expect(viewerAlbum.coverThumbnailUrl).toContain('picsum')
    expect(viewerAlbum.photoCount).toBe(photosOfAlbum(9).filter((p) => p.published).length)
    expect(toViewerAlbumPhotosResponse(findAlbum(9)!).photos).toHaveLength(viewerAlbum.photoCount)

    const viewerPhoto = toViewerPhoto(serializeViewerPhoto(photosOfAlbum(9)[0]))
    expect(viewerPhoto.url).toBe(viewerPhoto.downloadUrl)
    expect(viewerPhoto.thumbnailUrl).toContain('picsum')
  })

  it('공개 게이트 — 미검토는 인물·공통만 세고 특수 앨범은 제외한다 (CHMO-488)', () => {
    // 검수 중 운동회(1): 앨범 1만 검토 완료 → 나머지 인물·공통에 미검토가 남아 게이트에 걸린다
    expect(unreviewedGatePhotoCount(1)).toBeGreaterThan(0)

    // 인물·공통 사진을 전부 검토 완료 → 게이트 해제. 특수 앨범(분류 애매·품질 제외)에는
    // 미검토가 그대로 남아 있어야 한다 — 검토 UI가 없는 앨범을 세면 영영 공개할 수 없다(CHMO-357)
    const gateAlbums = db.albums.filter(
      (a) => a.eventId === 1 && (a.type === 'person' || a.type === 'common'),
    )
    for (const album of gateAlbums) {
      for (const photo of photosOfAlbum(album.id)) photo.reviewed = true
    }
    expect(unreviewedGatePhotoCount(1)).toBe(0)

    const specialAlbum = db.albums.find(
      (a) => a.eventId === 1 && a.type !== 'person' && a.type !== 'common',
    )!
    expect(photosOfAlbum(specialAlbum.id).some((p) => !p.reviewed)).toBe(true)
  })

  it('공개된 이벤트 — 발행 대기 없이 뷰어에 전량 노출된다 (CHMO-488)', () => {
    // 봄 소풍(2)은 전 사진 검토 + 발행 완료 시드 — 새 정책에선 published면 대기가 0이다
    // (전량 검토라야 공개되고 공개 후 사진 추가도 없다 — CHMO-486). 재공개 버튼이 열릴 여지가 없다
    expect(toEvent(toEventDetail(findEvent(2)!)).pendingPublishCount).toBe(0)
    expect(pendingPublishCountOf(2)).toBe(0)
    expect(toViewerEvent(toViewerEventSummary(findEvent(2)!)).photoCount).toBe(16)

    // 발행 재호출도 새로 나갈 사진이 없다(멱등)
    expect(publishEventPhotos(2)).toBe(0)
  })

  it('검수 중 이벤트 — 앨범 1만 검토 완료(부분 검수 상태)', () => {
    const albums = db.albums.filter((a) => a.eventId === 1).map((a) => toAlbum(toAlbumSummary(a)))
    expect(albums.find((a) => a.id === 1)!.unreviewedPhotoCount).toBe(0)
    expect(albums.find((a) => a.id === 2)!.unreviewedPhotoCount).toBeGreaterThan(0)
  })

  it('빈 앨범 — 마지막 사진이 빠져도 앨범이 남고 커버 null·REVIEWED (CHMO-418)', () => {
    const album = findAlbum(1)!
    for (const photo of photosOfAlbum(1)) unlinkPhotoFromAlbum(photo.id, 1)

    // 자동 삭제 폐지 — 앨범 행이 남고 커버만 비운다(유령 커버 방지)
    expect(findAlbum(1)).toBeDefined()
    expect(findAlbum(1)!.coverPhotoId).toBeNull()

    // BE CHMO-418 계약: photoCount 0 · 썸네일 null · reviewStatus REVIEWED(미검토 0이므로)
    const raw = toAlbumSummary(album)
    expect(raw).toMatchObject({
      photoCount: 0,
      unreviewedPhotoCount: 0,
      thumbnailPhotoId: null,
      thumbnailUrl: null,
      reviewStatus: 'REVIEWED',
    })
    // 매퍼가 null 썸네일을 그대로 통과시켜 08이 0장 카드(플레이스홀더)를 그린다
    expect(toAlbum(raw)).toMatchObject({ photoCount: 0, coverThumbnailUrl: null })
  })

  it('새 인물 앨범 생성 — 생성이 곧 이동, 소스가 비어도 남는다 (CHMO-416·418)', () => {
    const photoIds = photosOfAlbum(1).map((p) => p.id)
    expect(photoIds.length).toBeGreaterThan(0)
    const album = createManualPersonAlbum(1, 1, '김치즈', { sourceAlbumId: 1, photoIds })

    // FE createPersonAlbum이 읽는 응답 필드명(albumId·photoCount) + 인물 이름 실재
    expect(toCreateAlbumResponse(album)).toMatchObject({
      albumId: album.id,
      type: 'PERSON',
      personName: '김치즈',
      photoCount: photoIds.length,
    })
    // 이동(복사 아님): 소스에서 빠지고 새 앨범에 연결, 커버는 첫 이동 사진
    expect(photosOfAlbum(1)).toHaveLength(0)
    expect(photosOfAlbum(album.id)).toHaveLength(photoIds.length)
    expect(album.coverPhotoId).toBe(photoIds[0])
    // 전량 이동으로 빈 소스도 남는다(CHMO-418)
    expect(findAlbum(1)).toBeDefined()
    expect(findAlbum(1)!.coverPhotoId).toBeNull()
  })

  it('빈 인물 앨범 생성 — 사진 0장으로 태어나 08 그리드에 0장 카드로 나온다 (CHMO-456·471)', () => {
    const before = db.albums.filter((a) => a.eventId === 1).length
    const album = createManualPersonAlbum(1, 1, '이치즈')

    // FE createPersonAlbum이 읽는 응답(실서버 실측 형태) — 사진 없이도 인물 이름이 붙는다
    expect(toCreateAlbumResponse(album)).toMatchObject({
      albumId: album.id,
      type: 'PERSON',
      personName: '이치즈',
      photoCount: 0,
    })
    // 이동이 없으니 다른 앨범은 그대로 — 사진을 훔쳐오지 않는다
    expect(photosOfAlbum(album.id)).toHaveLength(0)
    expect(photosOfAlbum(1).length).toBeGreaterThan(0)

    // 그리드 목록에 즉시 포함 + 매퍼가 0장·커버 null을 통과시켜야 카드가 그려진다(CHMO-418 계약)
    const raw = albumsOfEvent(1).map(toAlbumSummary)
    expect(raw).toHaveLength(before + 1)
    expect(toAlbum(raw.find((a) => a.albumId === album.id)!)).toMatchObject({
      type: 'person',
      name: '이치즈',
      photoCount: 0,
      coverThumbnailUrl: null,
    })
  })

  it('앨범 삭제 — 이 앨범에만 속한 사진은 폐기, 다른 앨범 사본은 유지 (CHMO-271·435)', () => {
    const photos = photosOfAlbum(1)
    expect(photos.length).toBeGreaterThan(0)
    const shared = photos.filter((p) => p.albumIds.length > 1)
    const orphans = photos.filter((p) => p.albumIds.length === 1)

    deleteAlbumCascade(1)

    expect(findAlbum(1)).toBeUndefined()
    for (const p of orphans) expect(findPhoto(p.id)).toBeUndefined()
    for (const p of shared) {
      expect(findPhoto(p.id)).toBeDefined()
      expect(findPhoto(p.id)!.albumIds).not.toContain(1)
    }
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
    // 아래 둘은 소비처가 더는 안 읽지만(CHMO-347·357) BE 계약이라 목은 계속 준다 — 스위치 양쪽 동형
    expect(raw.reviewedPhotoCount).toBe(photosOfEvent(1).filter((p) => p.reviewed).length)
    expect(typeof raw.uncertainCount).toBe('number')
    // albums는 AlbumSummaryResponse[] — 매퍼가 그대로 읽어 화면 카드·검토 진척(앨범 단위, CHMO-357)이 된다
    expect(raw.albums.map(toAlbum)[0]).toMatchObject({
      id: expect.any(Number),
      name: expect.any(String),
      photoCount: expect.any(Number),
      unreviewedPhotoCount: expect.any(Number),
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
