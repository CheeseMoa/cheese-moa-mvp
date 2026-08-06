/**
 * 도메인 함수 계약 테스트 (CHMO-219).
 *
 * 검증하는 명제: **"실 BE가 이렇게 주면 화면은 이렇게 본다."**
 * 타입이 못 잡는 회귀가 여기 있다 — `toEvent`가 `PUBLISHED`를 소문자로 안 바꿔도 `tsc`는 통과한다.
 *
 * MSW 목도 이 형태로 응답한다(CHMO-195) — 목/실서버 겸용 계약이라 두 벌의 케이스가 필요 없다.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { attestGuardianConsent, listAgreements, submitAgreements } from './agreements'
import { GUARDIAN_CONSENT_COPY } from '../legal/consents'
import {
  deleteAccount,
  exchangeSocialCode,
  exchangeSocialSignup,
  getMe,
  login,
  signup,
} from './auth'
import {
  createPersonAlbum,
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
import {
  createGroup,
  findMyGroupByJoinKey,
  getGroup,
  getInviteInfo,
  joinGroup,
  listGroups,
  removeGroupMember,
} from './groups'
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
  BE_AGREEMENTS,
  BE_ALBUM_COMMON,
  BE_ALBUM_DETAIL,
  BE_ALBUM_DETAIL_UNCERTAIN,
  BE_ALBUM_EYES_CLOSED,
  BE_ALBUM_PERSON,
  BE_AUTH,
  BE_DELETE_PHOTOS,
  BE_ERRORS,
  BE_EVENT_CREATED,
  BE_EVENT_DETAIL,
  BE_EVENT_DETAIL_WITH_PROGRESS,
  BE_EVENT_PUBLISHED,
  BE_EVENT_SUMMARY,
  BE_GROUP_DETAIL,
  BE_GROUP_SUMMARY,
  BE_CREATE_ALBUM_EMPTY,
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
  it('BE bare 배열 목록 — groupId를 id로 옮기고, myMembership 없는 구계약 응답도 통과한다', async () => {
    serve(envelope([BE_GROUP_SUMMARY]))

    // 실 BE는 학부모 전환(CHMO-444) 미배포 — myMembership이 없어도 매퍼가 undefined로 흡수해
    // 기존 제작자 화면이 그대로 동작해야 한다(배포 전후 스위치 양쪽 공존 구간).
    // groupType도 없다(유형 도입 전) — business로 정규화한다(BE 백필과 같은 해석, CHMO-604).
    await expect(listGroups()).resolves.toEqual([
      {
        id: 6,
        name: 'CHMO-194 업로드검증',
        groupType: 'business',
        memberCount: 1,
        eventCount: 1,
        editorCount: undefined,
        viewerCount: undefined,
        myMembership: undefined,
        createdAt: '2026-07-10T03:33:06.314638Z',
      },
    ])
  })

  it('모임 유형·개명 카운트(BE CHMO-599·605) — groupType 소문자 정규화, editorCount/viewerCount 통과', async () => {
    // BE 스펙 대조(develop 머지·운영 미배포) — 실서버 채집 후 픽스처로 교체한다.
    serve(
      envelope({
        groupId: 12,
        name: '주말 등산 모임',
        groupType: 'GENERAL',
        memberCount: 3,
        editorCount: 3,
        viewerCount: 0,
        createdAt: '2026-08-06T00:00:00Z',
      }),
    )
    const group = await getGroup(12)
    expect(group.groupType).toBe('general')
    expect(group.editorCount).toBe(3)
    expect(group.viewerCount).toBe(0)
  })

  it('구계약 카운트(teacherCount/parentCount)를 editorCount/viewerCount로 흡수한다', async () => {
    // 운영 BE는 main 머지 전까지 구 필드명을 준다(배포 게이트) — FE가 먼저 나가도 05 카운트
    // 표기가 깨지지 않아야 한다.
    serve(
      envelope({
        groupId: 6,
        name: 'CHMO-194 업로드검증',
        memberCount: 3,
        teacherCount: 1,
        parentCount: 2,
        createdAt: '2026-07-10T03:33:06.314638Z',
      }),
    )
    const group = await getGroup(6)
    expect(group.editorCount).toBe(1)
    expect(group.viewerCount).toBe(2)
  })

  it('학부모 전환 초안 — myMembership(대문자 enum·claimedChildNames 생략)을 FE 계약으로 옮긴다', async () => {
    // BE 미배포 — parent-model-api-draft §1 초안 기대값(role 값은 CHMO-605 리네이밍 반영).
    // 배포 후 실채집 픽스처로 교체한다.
    serve(
      envelope([
        {
          groupId: 9,
          name: '햇살반',
          groupType: 'BUSINESS',
          myMembership: { role: 'VIEWER', status: 'PENDING', claimedChildNames: ['김민준'] },
          createdAt: '2026-07-25T00:00:00Z',
        },
        {
          groupId: 6,
          name: 'CHMO-194 업로드검증',
          groupType: 'BUSINESS',
          memberCount: 1,
          eventCount: 1,
          myMembership: { role: 'EDITOR', status: 'ACTIVE' },
          createdAt: '2026-07-10T03:33:06.314638Z',
        },
      ]),
    )

    const [pending, teacher] = await listGroups()
    expect(pending.myMembership).toEqual({
      role: 'viewer',
      status: 'pending',
      claimedChildNames: ['김민준'],
      linkedChildNames: [],
    })
    // PENDING 항목엔 멤버 정보가 없다(§7-3) — 매퍼가 undefined로 통과시킨다
    expect(pending.memberCount).toBeUndefined()
    // EDITOR는 claimedChildNames·linkedChildNames를 생략할 수 있다(초안 §1) — 빈 배열로 정규화
    expect(teacher.myMembership).toEqual({
      role: 'editor',
      status: 'active',
      claimedChildNames: [],
      linkedChildNames: [],
    })
  })

  it('구 역할 값(TEACHER/PARENT)도 editor/viewer로 흡수한다 — 운영 BE 공존 구간(CHMO-604)', async () => {
    // 운영 BE는 main 머지 전까지 구 값을 직렬화한다(ADR 021) — FE가 먼저 배포돼도
    // 홈 카드 분기(editor/viewer)가 깨지면 안 된다.
    serve(
      envelope([
        {
          groupId: 9,
          name: '햇살반',
          myMembership: { role: 'PARENT', status: 'ACTIVE', claimedChildNames: ['김민준'] },
          createdAt: '2026-07-25T00:00:00Z',
        },
        {
          groupId: 6,
          name: 'CHMO-194 업로드검증',
          myMembership: { role: 'TEACHER', status: 'ACTIVE' },
          createdAt: '2026-07-10T03:33:06.314638Z',
        },
      ]),
    )
    const [legacyParent, legacyTeacher] = await listGroups()
    expect(legacyParent.myMembership?.role).toBe('viewer')
    expect(legacyTeacher.myMembership?.role).toBe('editor')
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

  it('초대 2종(초안 §2) — 채널별 joinUrl을 joinKey로 경로형 파생한다 (CHMO-237·444)', async () => {
    serve(
      envelope({
        teacher: { joinKey: 'Fh1TDIk81EPP', password: 'PW1' },
        parent: { joinKey: 'Pk3xYz92QwEr', password: '7421' },
      }),
    )
    const invite = await getInviteInfo(6)
    expect(invite.teacher.joinKey).toBe('Fh1TDIk81EPP')
    expect(invite.parent?.password).toBe('7421')
    // node 환경엔 window가 없어 오리진이 빈다 — 경로형(/join/:joinKey)인 게 계약의 핵심이다.
    // 학부모 링크는 role 마커 포함 — joinKey가 불투명이라 02-2 분기의 유일한 근거(CHMO-445)
    expect(invite.teacher.joinUrl).toBe('/join/Fh1TDIk81EPP')
    expect(invite.parent?.joinUrl).toBe('/join/Pk3xYz92QwEr?role=parent')
  })

  it('초대 구계약 공존 — 평면 응답(현행 실 BE)은 teacher로 흡수하고 parent는 null', async () => {
    // 2026-07-16 실채집 형태 — joinUrl(쿼리형)은 버린다(CHMO-237)
    serve(
      envelope({
        joinKey: 'Fh1TDIk81EPP',
        password: '<group-password>',
        joinUrl: 'https://cheese-moa-mvp.vercel.app/join?joinKey=Fh1TDIk81EPP',
      }),
    )
    const invite = await getInviteInfo(6)
    expect(invite.teacher).toEqual({
      joinKey: 'Fh1TDIk81EPP',
      password: '<group-password>',
      joinUrl: '/join/Fh1TDIk81EPP',
    })
    expect(invite.parent).toBeNull()
  })

  it('참여 구계약 공존 — 즉시 합류(GroupDetail 형태) 응답을 active/editor로 흡수한다', async () => {
    // 현행 실 BE: 참여 즉시 합류 + 상세 형태 응답(role·status·groupName 없음).
    // 매퍼가 던지면 서버는 이미 합류를 끝냈는데 화면은 실패로 오인한다 — 반드시 성공으로 흡수.
    serve(envelope(BE_GROUP_DETAIL))
    const result = await joinGroup({ joinKey: 'K', password: 'p' })
    expect(result.status).toBe('active')
    // 구계약 = 선생님 초대 수락뿐 — editor(구 teacher)가 사실과 일치한다
    expect(result.role).toBe('editor')
    expect(result.groupId).toBe(6)
    // 구계약의 name 필드가 groupName으로 온다 — 토스트가 'undefined'를 그리지 않게
    expect(result.groupName).not.toBe('')
  })

  it('참여 초안 계약 — role·status 대문자 enum을 소문자로 옮긴다 (CHMO-444·605)', async () => {
    // BE 미배포 — parent-model-api-draft §3 초안 기대값(role 값은 CHMO-605 리네이밍 ·
    // groupType은 CHMO-599가 join 응답에도 실어 온다 — FE는 아직 소비하지 않고 버린다).
    // 배포 후 실채집 픽스처로 교체한다.
    serve(
      envelope({ groupId: 9, groupName: '햇살반', groupType: 'BUSINESS', role: 'VIEWER', status: 'PENDING' }),
    )
    await expect(joinGroup({ joinKey: 'P', password: '7421', childNames: ['김민준'] })).resolves.toEqual({
      groupId: 9,
      groupName: '햇살반',
      role: 'viewer',
      status: 'pending',
    })
  })

  it('모임 생성 — groupType을 동봉하고 password는 보내지 않는다 (BE CHMO-599)', async () => {
    // 참여 비밀번호는 서버 자동 발급(AC-9) — 요청에 password가 남아 있으면 무시되지만,
    // FE 계약은 아예 싣지 않는 것이다(입력란도 없다 — 03 개편은 CHMO-603).
    const calls = serve(
      envelope({
        groupId: 1001,
        name: '주말 등산 모임',
        groupType: 'GENERAL',
        memberCount: 1,
        createdAt: '2026-08-06T00:00:00Z',
      }),
    )
    const group = await createGroup({ name: '주말 등산 모임', groupType: 'general' })
    expect(bodyOf(calls[0])).toEqual({ name: '주말 등산 모임', groupType: 'GENERAL' })
    expect(group.groupType).toBe('general')
  })

  it('학부모 신청에 자녀 동의 버전이 그대로 실린다 — 생략하면 필드째 빠진다 (CHMO-587)', async () => {
    // childConsentVersion은 GET /agreements의 currentVersion 에코(BE CHMO-586) — 값 변형 금지.
    const calls = serve(
      envelope({ groupId: 9, groupName: '햇살반', role: 'PARENT', status: 'PENDING' }),
    )
    await joinGroup({
      joinKey: 'P',
      password: '7421',
      childNames: ['김민준'],
      childConsentVersion: '1.0',
    })
    expect(bodyOf(calls[0])).toEqual({
      joinKey: 'P',
      password: '7421',
      childNames: ['김민준'],
      childConsentVersion: '1.0',
    })

    // 구계약 BE(카탈로그에 항목 없음)·선생님 키 — undefined는 JSON에서 빠져 종전 계약 그대로다
    await joinGroup({ joinKey: 'K', password: 'p', childConsentVersion: undefined })
    expect(bodyOf(calls[1])).toEqual({ joinKey: 'K', password: 'p' })
  })

  it('멤버 내보내기·나가기 — 대상 userId가 본문 없이 경로에 실린다 (BE CHMO-525)', async () => {
    const calls = serve(envelope(null))

    await removeGroupMember(6, 42)

    expect(calls[0].url).toBe('/api/v1/groups/6/members/42')
    expect(calls[0].method).toBe('DELETE')
    expect(calls[0].body).toBeNull()
  })

  it('내보내기 경쟁 409는 LAST_TEACHER로 정규화된다 — 화면은 서버 메시지("최소 1명")를 그대로 띄운다 (CHMO-564)', async () => {
    const { status, payload } = BE_ERRORS.MEMBER409
    stubFetch(() => jsonResponse(payload, status))

    await expect(removeGroupMember(6, 42)).rejects.toMatchObject({
      status: 409,
      code: 'LAST_TEACHER',
      message: '모임에는 최소 1명의 선생님이 남아야 합니다.',
    })
  })

  it('분석 중 409는 MOMENT_ANALYZING으로 정규화된다 — 05 나가기가 문구를 나가기 문맥으로 바꿔 안내한다 (CHMO-564·571)', async () => {
    const { status, payload } = BE_ERRORS.MOMENT409
    stubFetch(() => jsonResponse(payload, status))

    await expect(removeGroupMember(6, 42)).rejects.toMatchObject({
      status: 409,
      code: 'MOMENT_ANALYZING',
    })
  })
})

/**
 * 초대 링크 재진입 감지(02-1) — 목록엔 joinKey가 없어(시크릿 미노출) 모임마다 초대 정보를 조회해 대조한다.
 * 타입이 못 보는 규칙: **조회 실패를 '비멤버'로 단정하지 않는다.** 일시 오류로 "이미 멤버인데
 * 비번 모달을 다시 띄우는" 오판을 막는 게 이 함수의 존재 이유다.
 */
describe('findMyGroupByJoinKey', () => {
  // 2종 채널(CHMO-444) — 대조는 선생님/학부모 어느 joinKey든 매치한다
  const inviteOf = (joinKey: string) =>
    envelope({
      teacher: { joinKey, password: 'PW' },
      parent: { joinKey: `P-${joinKey}`, password: '0000' },
    })
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

  it('결정적 실패(ROLE403 학부모 멤버십·404 은닉)는 재시도하지 않는다', async () => {
    // 학부모 role 모임의 초대 조회는 항상 ROLE403 — 재시도해도 같은 답이라 헛요청만 는다
    let attempts = 0
    stubInvites({
      6: () => {
        attempts += 1
        return jsonResponse(errorEnvelope('ROLE403', '권한이 없습니다.'), 403)
      },
      5: () => jsonResponse(inviteOf('K5')),
    })

    await expect(findMyGroupByJoinKey('K6')).resolves.toBeNull()
    expect(attempts).toBe(1)
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
      // 상세 응답엔 thumbnailUrl이 아예 없다 — 매퍼가 null로 채운다(커버 원천은 목록뿐, CHMO-515)
      coverThumbnailUrl: null,
      // progress 필드가 없던 채집분 — 매퍼가 null로 채운다(CHMO-287 전 BE와의 호환)
      progress: null,
      // pendingPublishCount도 없던 채집분(CHMO-324 전) — 매퍼가 undefined로 통과시킨다
      pendingPublishCount: undefined,
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
    // 발행 대기(CHMO-324 재공개 게이트)가 그대로 통과한다 — 14 재공개 버튼·08 배지의 분기 기준
    expect(event.pendingPublishCount).toBe(3)
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

  it('목록의 thumbnailUrl이 05 카드 커버가 된다 (CHMO-515)', async () => {
    // 커버는 목록 응답에만 있다 — 05가 상세를 원천으로 삼으면 커버가 통째로 사라진다.
    // 이 매핑이 빠져도 tsc는 통과한다(옵셔널 필드) — 카드만 조용히 회색 면이 된다
    serve(envelope([BE_EVENT_PUBLISHED]))
    const [event] = await listGroupEvents(6)
    expect(event.coverThumbnailUrl).toBe(BE_EVENT_PUBLISHED.thumbnailUrl)

    // 사진 0장 이벤트는 서버가 null을 준다 — 카드는 이 null을 컴팩트 카드로 그린다
    serve(envelope([BE_EVENT_SUMMARY]))
    const [empty] = await listGroupEvents(6)
    expect(empty.coverThumbnailUrl).toBeNull()
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
      // faceBboxes·causes는 키 생략이 기본(NON_EMPTY) — 매퍼가 빈 배열로 정규화한다(CHMO-412)
      faceBboxes: [],
      causes: [],
    })
  })

  it("BE '분류가 어려워요' 앨범 상세 — 사진의 faceBboxes(배열)·causes가 그대로 전달된다(CHMO-393·410)", async () => {
    serve(envelope(BE_ALBUM_DETAIL_UNCERTAIN))

    const { album, photos } = await getAlbumWithPhotos(15)

    // 특수 앨범 표시명 파생은 기존 규칙 그대로(회귀 없음)
    expect(album).toMatchObject({ id: 15, type: 'uncertain', personId: null })
    expect(photos[0].faceBboxes).toEqual([
      { x: 120, y: 48, w: 260, h: 300 },
      { x: 500, y: 60, w: 180, h: 210 },
    ])
    expect(photos[0].causes).toEqual(['low_resolution', 'small_faces'])
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

  // 실 BE가 similarity를 더는 보내지 않는다(2026-07-29) — 키가 통째로 빠진 응답이 온다.
  // 그대로 흘리면 undefined가 `number | null` 자리에 앉아, 화면이 %를 다시 붙이는 날
  // `NaN%`로 새어 나온다(옛 코드가 null만 걸렀던 이유가 이것)
  it('BE 이동 추천 — similarity 키가 없으면 null로 정규화한다', async () => {
    serve(
      envelope([
        {
          albumId: BE_MOVE_SUGGESTION_PERSON.albumId,
          type: BE_MOVE_SUGGESTION_PERSON.type,
          personName: BE_MOVE_SUGGESTION_PERSON.personName,
          thumbnailUrl: BE_MOVE_SUGGESTION_PERSON.thumbnailUrl,
        },
      ]),
    )

    const suggestions = await getMoveSuggestions(11, [101])

    expect(suggestions[0].similarity).toBeNull()
    expect(suggestions[0].name).toBe('서준')
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

  it('빈 앨범 생성 — 이름만 보내고 짝(sourceAlbumId·photoIds)은 아예 빠진다 (CHMO-456)', async () => {
    const calls = serve(envelope(BE_CREATE_ALBUM_EMPTY, 'COMMON201'))

    const result = await createPersonAlbum(63, { name: '이치즈' })

    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toBe('/api/v1/events/63/albums')
    // 짝은 함께 보내거나 함께 생략해야 한다 — 한쪽만 실려 나가면 실 BE가 VALID400을 준다
    expect(bodyOf(calls[0])).toEqual({ name: '이치즈' })
    expect(result).toEqual({ albumId: 832, photoCount: 0 })
  })

  it('생성=이동 — 짝을 주면 그대로 실려 나가고 옮긴 장수가 온다 (CHMO-416)', async () => {
    const calls = serve(
      envelope({ ...BE_CREATE_ALBUM_EMPTY, personName: '김치즈', photoCount: 3 }, 'COMMON201'),
    )

    const result = await createPersonAlbum(63, {
      name: '김치즈',
      sourceAlbumId: 279,
      photoIds: [101, 102, 103],
    })

    expect(bodyOf(calls[0])).toEqual({
      name: '김치즈',
      sourceAlbumId: 279,
      photoIds: [101, 102, 103],
    })
    expect(result).toEqual({ albumId: 832, photoCount: 3 })
  })

  it('BE 삭제 — 연결 해제와 완전 삭제를 구분해 준다', async () => {
    const calls = serve(envelope(BE_DELETE_PHOTOS))

    const result = await deletePhotos({ albumId: 11, photoIds: [101, 102] })

    expect(calls[0].method).toBe('DELETE')
    expect(bodyOf(calls[0])).toEqual({ albumId: 11, photoIds: [101, 102] })
    expect(result).toEqual({ detachedCount: 2, deletedPhotoCount: 1 })
  })
})

describe('공개 요약 (14)', () => {
  it('미리보기 앨범은 BE albums[]에서 파생한다 — 발행 대상(전량 검토된 person/common)만 (CHMO-346·488)', async () => {
    serve(envelope(BE_REVIEW_SUMMARY))

    const summary = await getReviewSummary(4)

    // 검토 진척은 앨범 단위 파생(CHMO-357): person(미검토 3장)·common(전량 검토)만 세고
    // eyes_closed는 미검토여도 제외 — BE reviewedAlbums(1)/unreviewedAlbums(2)와 다른 값이 맞다
    // albumCount(BE totalAlbums)는 매핑하지 않는다 — 14가 '공개할 앨범'만 보여준다(CHMO-488)
    expect(summary).toMatchObject({
      photoCount: 19,
      reviewedAlbumCount: 1,
      reviewableAlbumCount: 2,
    })
    expect('albumCount' in summary).toBe(false)
    // 미리보기 = 전량 검토된 common만. person은 12장 중 3장이 미검토라 공개해도 나가지 않으므로
    // "학부모가 볼 화면"에 넣지 않는다(CHMO-488 — 종전엔 검토분이 1장이라도 있으면 담았다).
    // 앨범 카드가 쓰는 이름·검토 수치·커버까지 매핑돼 온다
    expect(summary.previewAlbums).toHaveLength(1)
    expect(summary.previewAlbums[0]).toMatchObject({
      id: 13,
      type: 'common',
      name: '공통',
      photoCount: 5,
      unreviewedPhotoCount: 0,
      coverThumbnailUrl: BE_ALBUM_COMMON.thumbnailUrl,
    })
    // 그 person 앨범은 공개를 막는 쪽으로 간다 — 14가 이름·남은 장수로 안내하는 목록(CHMO-488)
    expect(summary.unreviewedAlbums).toHaveLength(1)
    expect(summary.unreviewedAlbums[0]).toMatchObject({
      id: 11,
      type: 'person',
      name: '지민',
      photoCount: 12,
      unreviewedPhotoCount: 3,
      coverThumbnailUrl: BE_ALBUM_PERSON.thumbnailUrl,
    })
  })

  it('앨범 카드 그리드는 상한 없이 전량 — 커버 없는 앨범도 카드로 나온다 (CHMO-346, 6장 캡 제거)', async () => {
    const albums = Array.from({ length: 8 }, (_, i) => ({
      ...BE_ALBUM_PERSON,
      albumId: 20 + i,
      // 미리보기는 전량 검토된 앨범만 담는다(CHMO-488) — 캡 없음을 보려면 8개 다 검토 완료여야 한다
      unreviewedPhotoCount: 0,
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

  it('공개되지 않는 앨범 = 사진 있는 특수 앨범 — 통계에도 미리보기에도 없는 갈래 (CHMO-521)', async () => {
    serve(envelope(BE_REVIEW_SUMMARY))

    const summary = await getReviewSummary(4)

    // eyes_closed는 검토 대상(reviewable)도 발행 대상(preview)도 아니라 지금까지 어디에도
    // 안 잡혔다 — 14가 이름·장수로 "이건 안 나가요"를 알리려면 이 갈래가 필요하다
    expect(summary.excludedAlbums).toHaveLength(1)
    expect(summary.excludedAlbums[0]).toMatchObject({
      id: 14,
      type: 'eyes_closed',
      name: '눈감은 사진',
      photoCount: 2,
    })
  })

  it('사진 0장 특수 앨범은 고지하지 않는다 — 안 나가는 사진이 0장이다 (CHMO-521)', async () => {
    const albums = [
      BE_ALBUM_PERSON,
      { ...BE_ALBUM_EYES_CLOSED, photoCount: 0, unreviewedPhotoCount: 0 },
    ]
    serve(envelope({ ...BE_REVIEW_SUMMARY, albums }))

    const summary = await getReviewSummary(4)
    expect(summary.excludedAlbums).toEqual([])
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
    // duplicateCount(CHMO-254·606) — 재업로드 시 중복 제외 수. 변환 없이 그대로 통과한다
    expect(result).toEqual({ jobId: BE_REGISTER_PHOTOS.jobId, registeredCount: 2, duplicateCount: 0 })
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
  // nickname은 여전히 버린다 — 쓰는 화면이 없다. userId는 온보딩 1회 판정용(CHMO-481)
  it('BE AuthResponse의 평면 필드에서 userId와 두 토큰을 남긴다', async () => {
    serve(envelope(BE_AUTH))
    await expect(login({ nickname: 'FE연동테스트', pin: '0709' })).resolves.toEqual({
      userId: 4,
      accessToken: '<access-jwt>',
      refreshToken: '<refresh-token>',
    })
  })

  it('가입은 필수 동의 4종을 대문자 enum으로 동봉한다 — BE CHMO-598(없으면 VALID400)', async () => {
    const calls = serve(envelope(BE_AUTH), 201)

    await signup({ nickname: '치즈', pin: '1234' })

    // 정확 일치로 고정하는 두 가지: MARKETING을 싣지 않는다(정본 §1.1 — 화면에 없는 항목의
    // 거부 기록을 만들지 않는다) · 모임 스코프 항목이 섞이지 않는다(BE VALID400).
    // 버전 원천은 FE 문구(src/legal — CHMO-517)라 문구 개정 시 BE AgreementType과 함께 올린다.
    expect(bodyOf(calls[0])).toEqual({
      nickname: '치즈',
      pin: '1234',
      agreements: [
        { type: 'AGE_14_OVER', version: '1.0', agreed: true },
        { type: 'TERMS_OF_SERVICE', version: '1.0', agreed: true },
        { type: 'PRIVACY_POLICY', version: '1.0', agreed: true },
        { type: 'FACE_DATA', version: '1.0', agreed: true },
      ],
    })
  })

  // 소셜 가입 유예(CHMO-602 · BE CHMO-598의 소셜판) — 콜백 signup=true 분기가 이 함수를 탄다.
  // 동봉 규칙은 signup과 동일: MARKETING 미동봉·모임 스코프 항목 배제·버전 원천은 FE 문구
  it('소셜 가입 exchange는 코드에 필수 동의 4종을 동봉한다', async () => {
    const calls = serve(envelope(BE_AUTH))

    await exchangeSocialSignup('otc-123')

    expect(calls[0].url).toBe('/api/v1/auth/social/exchange')
    expect(bodyOf(calls[0])).toEqual({
      code: 'otc-123',
      agreements: [
        { type: 'AGE_14_OVER', version: '1.0', agreed: true },
        { type: 'TERMS_OF_SERVICE', version: '1.0', agreed: true },
        { type: 'PRIVACY_POLICY', version: '1.0', agreed: true },
        { type: 'FACE_DATA', version: '1.0', agreed: true },
      ],
    })
  })

  it('기존 유저 소셜 exchange는 코드만 — agreements 키 자체가 실리지 않는다', async () => {
    const calls = serve(envelope(BE_AUTH))

    await exchangeSocialCode('otc-123')

    expect(bodyOf(calls[0])).toEqual({ code: 'otc-123' })
  })

  it('BE 프로필의 userId를 id로 옮긴다', async () => {
    serve(envelope(BE_USER))
    await expect(getMe()).resolves.toEqual({
      id: 4,
      nickname: 'FE연동테스트',
      createdAt: '2026-07-09T09:50:37.543598Z',
    })
  })

  it('계정 삭제 — DELETE /me (실 BE 확정 경로, CHMO-524 · 초안 /users/me 폐기, CHMO-575)', async () => {
    // 2026-08-03 실서버 채집 — 성공 봉투에 result 키가 아예 없다(envelope(null)과 다른 형태)
    const calls = serve({ isSuccess: true, code: 'COMMON200', message: '성공입니다.' })

    await deleteAccount()

    expect(calls[0].url).toBe('/api/v1/me')
    expect(calls[0].method).toBe('DELETE')
    expect(calls[0].body).toBeNull()
  })
})

describe('약관 동의 (CHMO-514 계약)', () => {
  it('대문자 enum(type·scope)을 소문자로 내리고 agreements 키를 벗긴다', async () => {
    serve(envelope(BE_AGREEMENTS))

    const agreements = await listAgreements()

    expect(agreements[0]).toEqual({
      type: 'age_14_over',
      currentVersion: '1.0',
      required: true,
      scope: 'user',
      agreed: false,
    })
    // 모임 스코프 항목도 목록에 섞여 온다 — 가입 게이트는 scope로 걸러야 한다(CHMO-479)
    expect(agreements[agreements.length - 1]).toMatchObject({
      type: 'child_consent_attested',
      scope: 'group',
    })
  })

  it('제출은 BE 대문자 enum으로 되돌려 보낸다 — 선택 항목의 미동의도 그대로 실린다', async () => {
    const calls = serve(envelope(BE_AGREEMENTS))

    await submitAgreements([
      { type: 'terms_of_service', version: '1.0', agreed: true },
      { type: 'marketing', version: '1.0', agreed: false },
    ])

    expect(calls[0].url).toBe('/api/v1/agreements')
    expect(calls[0].method).toBe('POST')
    expect(bodyOf(calls[0])).toEqual({
      agreements: [
        { type: 'TERMS_OF_SERVICE', version: '1.0', agreed: true },
        { type: 'MARKETING', version: '1.0', agreed: false },
      ],
    })
  })

  it('보호자 동의 확인은 FE 문장 버전을 싣는다 — 서버 조회 에코 없음(CHMO-517)', async () => {
    const calls = serve(envelope(null))

    await attestGuardianConsent(6)

    // 종전엔 GET /agreements로 현재 버전을 읽어 되돌려줬다 — 이제 화면에 보여준 확인 문장의
    // 버전(GUARDIAN_CONSENT_COPY.version)이 원천이라 요청이 하나다
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/v1/groups/6/agreements')
    expect(calls[0].method).toBe('POST')
    // 항목은 싣지 않는다 — 모임 스코프 항목이 하나뿐이라 BE가 받지 않는다
    expect(bodyOf(calls[0])).toEqual({ version: GUARDIAN_CONSENT_COPY.version })
  })

  it('업로드 presign의 428은 GUARDIAN_CONSENT_REQUIRED로 정규화된다 (화면이 모달로 분기)', async () => {
    const { status, payload } = BE_ERRORS.AGREEMENT428
    stubFetch(() => jsonResponse(payload, status))

    await expect(presignUploads(4, [{ fileName: 'a.jpg', size: 100 }])).rejects.toMatchObject({
      status: 428,
      code: 'GUARDIAN_CONSENT_REQUIRED',
      message: '아동 보호자 동의 확보 확인이 필요합니다.',
    })
  })
})
