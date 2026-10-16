/**
 * 실 BE(`http://3.35.177.22`) 응답 픽스처 (CHMO-219).
 *
 * **채집분** — 2026-07-10 실서버 curl(계정 `FE연동테스트`, 모임 6 / 이벤트 4):
 * `/auth/login` · `/auth/refresh` · `/me` · `/groups` · `/groups/:id` · `/groups/:id/events` ·
 * `/groups/:id/invite` · `/groups/:id/share` · `/events/:id` · `/events/:id/albums` ·
 * `/events/:id/analysis` · `/events/:id/review-summary` · `/events/:id/photos/presign` ·
 * `/share/:token/unlock` · `/share/:token` · 에러 봉투 전부.
 *
 * **스키마 기준(미채집)** — 이 계정엔 분류된 앨범·사진이 없어 응답을 받을 수 없었다.
 * 스웨거(`/v3/api-docs`)의 `AlbumSummaryResponse`·`AlbumDetailResponse`·`PhotoInAlbumResponse`·
 * `MoveSuggestionResponse`·`ViewerEventAlbumsResponse`·`ViewerAlbumPhotosResponse`에서 필드명과
 * enum을 그대로 옮기고 값만 채웠다. 개별 상수에 `(스키마 기준)` 표시.
 *
 * 시크릿(JWT·presigned URL 서명·AWS 키·초대/공유 비밀번호)은 자리표시자로 치환했다 —
 * 계약은 형태지 값이 아니다.
 */

// ── 봉투 (성공/실패 공통) ────────────────────────────────────

/** 성공 봉투 — result만 다르고 겉은 항상 같다 */
export function envelope<T>(result: T, code = 'COMMON200') {
  return { isSuccess: true, code, message: '성공입니다.', result }
}

/** 실패 봉투 — result 없이 code·message만 온다 */
export function errorEnvelope(code: string, message: string) {
  return { isSuccess: false, code, message }
}

/** 채집한 에러 봉투 + 실제 HTTP status */
export const BE_ERRORS = {
  /** 인증 필요/토큰 무효 — GET /me (토큰 없이) */
  COMMON401: { status: 401, payload: errorEnvelope('COMMON401', '인증이 필요합니다.') },
  /** 로그인 실패 — POST /auth/login (PIN 불일치) */
  AUTH401: {
    status: 401,
    payload: errorEnvelope('AUTH401', '닉네임 또는 PIN이 일치하지 않습니다.'),
  },
  /** refreshToken 만료/무효 — POST /auth/refresh */
  TOKEN401: {
    status: 401,
    payload: errorEnvelope('TOKEN401', '리프레시 토큰이 유효하지 않습니다.'),
  },
  /** 비밀번호 불일치 — POST /share/:token/unlock (모임 참여도 같은 코드) */
  JOIN403: { status: 403, payload: errorEnvelope('JOIN403', '비밀번호가 일치하지 않습니다.') },
  /** 모임 없음 — POST /groups/join (없는 joinKey · 2026-07-16 CHMO-285 착수 중 채집) */
  SPACE404: { status: 404, payload: errorEnvelope('SPACE404', '모임을 찾을 수 없습니다.') },
  /** 앨범 없음 — GET /albums/999999 */
  ALBUM404: { status: 404, payload: errorEnvelope('ALBUM404', '앨범을 찾을 수 없습니다.') },
  /** 지원하지 않는 확장자 — POST /events/:id/photos/presign (a.gif) */
  PHOTO400: { status: 400, payload: errorEnvelope('PHOTO400', '지원하지 않는 파일 형식입니다.') },
  /** 다른 이벤트의 업로드 키 — POST /events/:id/photos (CHMO-194 착수 중 채집) */
  VALID400: {
    status: 400,
    payload: errorEnvelope('VALID400', '이 이벤트의 업로드 키가 아닙니다.'),
  },
  /** S3 PUT 안 한 키 — POST /events/:id/photos (CHMO-194 착수 중 채집) */
  PHOTO404: {
    status: 404,
    payload: errorEnvelope('PHOTO404', 'S3에 업로드되지 않은 사진이 있습니다.'),
  },
  /** 공개 시 미검토 존재 — POST /events/:id/publish force 없이 (2026-07-22 CHMO-265 착수 중 채집) */
  PUBLISH409: {
    status: 409,
    payload: errorEnvelope('PUBLISH409', '검토되지 않은 사진이 있습니다.'),
  },
  /**
   * 보호자 동의 확보 확인 없이 업로드 — POST /events/:id/photos/presign.
   * **BE 소스 기준(미채집)**: CHMO-514 PR #154 `ErrorStatus.GUARDIAN_CONSENT_REQUIRED`
   * (PRECONDITION_REQUIRED). 실서버 채집은 BE 배포 후.
   */
  AGREEMENT428: {
    status: 428,
    payload: errorEnvelope('AGREEMENT428', '아동 보호자 동의 확보 확인이 필요합니다.'),
  },
  /**
   * 멤버 **내보내기**로 ACTIVE 선생님이 0명이 되는 경우 — DELETE /groups/:id/members/:userId.
   * **BE 소스 기준(미채집)**: CHMO-525 PR #155 `ErrorStatus.LAST_TEACHER` — 메시지는 CHMO-564에서
   * 갱신됐다(마지막 선생님의 **나가기**가 모임 삭제로 승격되면서 종전 "모임 삭제를 쓰라" 안내가
   * 폐기되고, 이 코드는 동시 나가기 경쟁의 내보내기에만 남았다). 실서버 채집은 배포 후.
   */
  MEMBER409: {
    status: 409,
    payload: errorEnvelope('MEMBER409', '모임에는 최소 1명의 선생님이 남아야 합니다.'),
  },
  /**
   * 분석 중 이벤트가 있는 모임의 삭제·마지막 선생님 나가기 — DELETE /groups/:id(/members/:userId).
   * **BE 소스 기준(미채집)**: `ErrorStatus.MOMENT_ANALYZING`(CHMO-564 AC-3 대조 — 나가기로 모임
   * 삭제의 분석 중 가드를 우회할 수 없다). 실서버 채집은 배포 후.
   */
  MOMENT409: {
    status: 409,
    payload: errorEnvelope(
      'MOMENT409',
      '분석 중인 이벤트는 삭제할 수 없습니다. 분석이 끝난 뒤 다시 시도해 주세요.',
    ),
  },
  /** 관리자가 아님 — GET /admin/stats (비관리자 토큰 · 2026-08-04 실서버 채집, CHMO-379 프로브) */
  ADMIN403: { status: 403, payload: errorEnvelope('ADMIN403', '관리자 권한이 필요합니다.') },
  /** 같은 Idempotency-Key에 다른 내용의 어드민 쓰기 — BE CHMO-932 ErrorStatus.ADMIN_REQUEST_CONFLICT 소스 대조(미채집) */
  ADMIN409: {
    status: 409,
    payload: errorEnvelope('ADMIN409', '같은 Idempotency-Key로 다른 요청이 이미 처리되었습니다.'),
  },
  // ── 업로드 과금·장수 (BE CHMO-912 — 어드민 CHMO-931). **BE ErrorStatus 소스 대조(미채집)** ──
  /** 장수 부족 — 어드민 회수가 잔액을 넘을 때(`CreditAccount.adjust`) */
  CREDIT409: { status: 409, payload: errorEnvelope('CREDIT409', '무료 사진 장수가 부족합니다.') },
  /** 장수 기능 미설정 — `credit.enforcement-starts-at`이 비면 어드민 장수 조회·조정 전부 */
  BILLING503: { status: 503, payload: errorEnvelope('BILLING503', '결제 기능을 사용할 수 없습니다.') },
  /** 사용자 없음 — 어드민 장수·구독 대상 userId */
  USER404: { status: 404, payload: errorEnvelope('USER404', '사용자를 찾을 수 없습니다.') },
  /**
   * 기관 도입 문의 전이 실패 2종 — BE CHMO-810 티켓 코멘트 대조(코드 확정·**메시지 미채집**이라
   * BE 어투로 둔다). 409는 종료분을 진행 중으로 되돌리는데 그 사용자가 이미 새 문의를 낸 경우.
   */
  INQUIRY404: { status: 404, payload: errorEnvelope('INQUIRY404', '문의를 찾을 수 없습니다.') },
  INQUIRY409: { status: 409, payload: errorEnvelope('INQUIRY409', '이미 진행 중인 문의가 있습니다.') },
  /** 없는 신고·문의 — GET /admin/reports/999999 (2026-09-27 스테이징 실채집) */
  REPORT404: { status: 404, payload: errorEnvelope('REPORT404', '신고·문의를 찾을 수 없습니다.') },
  /**
   * 이벤트 팝업·혜택 푸시 어드민 3종 — **BE 소스 기준(미채집)**: CHMO-926 PR #312
   * `ErrorStatus.INVALID_POPUP`·`INVALID_CAMPAIGN`·`CAMPAIGN_CONFLICT`. 운영 미배포(2026-10-14
   * 프로브 — `/popups/active` COMMON404)라 실서버 채집은 배포 후.
   */
  POPUP400: { status: 400, payload: errorEnvelope('POPUP400', '팝업 설정이 올바르지 않습니다.') },
  CAMPAIGN400: {
    status: 400,
    payload: errorEnvelope('CAMPAIGN400', '발송 시각 또는 수신 조건이 올바르지 않습니다.'),
  },
  CAMPAIGN409: {
    status: 409,
    payload: errorEnvelope('CAMPAIGN409', '이미 처리된 요청이거나 취소할 수 없는 발송입니다.'),
  },
}

// ── 인증 / 프로필 ────────────────────────────────────────────

/** POST /auth/login · /auth/signup — AuthResponse(user 객체 없이 평면 필드) */
export const BE_AUTH = {
  userId: 4,
  nickname: 'FE연동테스트',
  accessToken: '<access-jwt>',
  refreshToken: '<refresh-token>',
}

/** GET /me — UserProfileResponse(userId ≠ id) */
export const BE_USER = {
  userId: 4,
  nickname: 'FE연동테스트',
  createdAt: '2026-07-09T09:50:37.543598Z',
}

// ── 모임 ─────────────────────────────────────────────────────

/** GET /groups — GroupSummaryResponse[](bare 배열). groupId ≠ id, createdAt에 Z가 붙는다 */
export const BE_GROUP_SUMMARY = {
  groupId: 6,
  name: 'CHMO-194 업로드검증',
  memberCount: 1,
  eventCount: 1,
  createdAt: '2026-07-10T03:33:06.314638Z',
}

/** GET /groups/:id — GroupDetailResponse. **eventCount가 없다**(화면이 이벤트 목록 길이로 파생) */
export const BE_GROUP_DETAIL = {
  groupId: 6,
  name: 'CHMO-194 업로드검증',
  memberCount: 1,
  createdAt: '2026-07-10T03:33:06.314638Z',
}

/**
 * GET /groups/:id/invite — 평문 비밀번호 포함(값은 치환). 목록엔 joinKey가 없어 이걸로 대조한다.
 *
 * **학부모 전환 초안 계약(CHMO-444 — 실서버 미채집)**: 2종 채널(선생님/학부모, Q6)로 바뀐다.
 * 실서버 구계약(2026-07-16 채집)은 평면 {joinKey, password, joinUrl(쿼리형 — CHMO-237)}이었다 —
 * BE가 초안을 구현·배포하면 이 픽스처를 실채집으로 교체한다. joinUrl은 초안에서 응답에 없다
 * (FE가 joinKey로 경로형을 파생 — CHMO-237 규칙은 그대로).
 */
export const BE_GROUP_INVITE = {
  teacher: { joinKey: '<join-key>', password: '<group-password>' },
  parent: { joinKey: '<parent-join-key>', password: '<share-password>' },
}

// ── 이벤트 ───────────────────────────────────────────────────

/**
 * POST /groups/:id/events — 생성 응답의 `createdAt`엔 **오프셋이 없다**(같은 이벤트를 GET하면 Z가 붙는다).
 * client.ts의 `normalizeTimestamps`가 없으면 브라우저가 KST로 읽어 9시간 밀린다. BE 정리는 CHMO-205.
 */
export const BE_EVENT_CREATED = {
  eventId: 4,
  name: '업로드 3단계 검증',
  status: 'EMPTY',
  eventDate: '2026-07-10',
  thumbnailPhotoId: null,
  thumbnailUrl: null,
  photoCount: 0,
  albumCount: 0,
  createdAt: '2026-07-10T03:33:06.41365825',
}

/** GET /groups/:id/events — EventSummaryResponse[](bare 배열). thumbnailUrl 있음, publishedAt 없음 */
export const BE_EVENT_SUMMARY = {
  eventId: 4,
  name: '업로드 3단계 검증',
  status: 'ANALYZING',
  eventDate: '2026-07-10',
  thumbnailPhotoId: null,
  thumbnailUrl: null,
  photoCount: 0,
  albumCount: 0,
  createdAt: '2026-07-10T03:33:06.413658Z',
}

/** GET /events/:id — EventDetailResponse. groupId·publishedAt 있음, **thumbnailUrl 없음** */
export const BE_EVENT_DETAIL = {
  eventId: 4,
  groupId: 6,
  name: '업로드 3단계 검증',
  status: 'ANALYZING',
  eventDate: '2026-07-10',
  thumbnailPhotoId: null,
  photoCount: 0,
  albumCount: 0,
  publishedAt: null,
  createdAt: '2026-07-10T03:33:06.413658Z',
}

/**
 * GET /events/:id — 분석 job 진행 중(2026-07-16 채집, CHMO-287).
 * `progress`가 붙는다(BE가 percent까지 계산). 완료 후엔 null로 돌아간다.
 * 채집 당시 두 번째 job이 돌던 이벤트라 status가 REVIEW인 채로 progress가 왔다 —
 * status와 progress는 독립이다(첫 업로드에선 ANALYZING과 함께 온다).
 */
export const BE_EVENT_DETAIL_WITH_PROGRESS = {
  eventId: 42,
  groupId: 6,
  name: '진행률API 관찰용',
  status: 'REVIEW',
  eventDate: '2026-07-16',
  thumbnailPhotoId: null,
  photoCount: 22,
  albumCount: 1,
  publishedAt: null,
  createdAt: '2026-07-16T07:17:38.138371Z',
  progress: { processed: 9, total: 20, percent: 45 },
}

/** 공개된 이벤트 (스키마 기준) — 대문자 enum이 소문자로 내려오는지 고정 */
export const BE_EVENT_PUBLISHED = {
  eventId: 7,
  groupId: 6,
  name: '여름 물놀이',
  status: 'PUBLISHED',
  eventDate: '2026-06-27',
  thumbnailPhotoId: 101,
  thumbnailUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/thumbs/101.jpg',
  photoCount: 120,
  albumCount: 8,
  publishedAt: '2026-06-28T01:00:00Z',
  createdAt: '2026-06-27T00:41:00Z',
  // 발행 대기 수(CHMO-324 재공개 게이트 — PR#91 EventDetailResponse 기준. 상세 전용, 목록엔 없다)
  pendingPublishCount: 3,
}

// `GET /events/:id/analysis`(AnalysisStatusResponse)는 픽스처를 두지 않는다 —
// 폴링이 없어 도메인 함수도 화면도 이 엔드포인트를 부르지 않는다(MSW 핸들러만 존재).

// ── 앨범 · 사진 ──────────────────────────────────────────────

/** AlbumSummaryResponse (스키마 기준) — 인물 앨범은 personName·personId 보유 */
export const BE_ALBUM_PERSON = {
  albumId: 11,
  type: 'PERSON',
  personName: '지민',
  personId: 7,
  photoCount: 12,
  unreviewedPhotoCount: 3,
  thumbnailPhotoId: 101,
  thumbnailUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/thumbs/101.jpg',
  reviewStatus: 'UNREVIEWED',
}

/** AlbumSummaryResponse (스키마 기준) — 공통 앨범은 personName이 null(표시명은 FE가 파생) */
export const BE_ALBUM_COMMON = {
  albumId: 13,
  type: 'COMMON',
  personName: null,
  personId: null,
  photoCount: 5,
  unreviewedPhotoCount: 0,
  thumbnailPhotoId: 105,
  thumbnailUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/thumbs/105.jpg',
  reviewStatus: 'REVIEWED',
}

/** AlbumSummaryResponse (스키마 기준) — 특수 앨범(뷰어 비노출). 커버가 없으면 thumbnail* 이 null */
export const BE_ALBUM_EYES_CLOSED = {
  albumId: 14,
  type: 'EYES_CLOSED',
  personName: null,
  personId: null,
  photoCount: 2,
  unreviewedPhotoCount: 2,
  thumbnailPhotoId: null,
  thumbnailUrl: null,
  reviewStatus: 'UNREVIEWED',
}

/** PhotoInAlbumResponse (스키마 기준) — eyesClosed/blurry가 평면 필드, 원본 url 없이 downloadUrl뿐 */
export const BE_PHOTO_IN_ALBUM = {
  photoId: 101,
  s3Key: 'originals/events/4/0aadfd6b-8dbc-4ed5-810a-348187a1b3d6.jpg',
  thumbnailUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/thumbs/101.jpg',
  downloadUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/originals/101.jpg',
  blurry: false,
  eyesClosed: true,
  reviewed: false,
  albumIds: [11, 14],
}

/** GET /albums/:id — AlbumDetailResponse (스키마 기준). photos를 내장하고 thumbnail* 필드가 없다 */
export const BE_ALBUM_DETAIL = {
  albumId: 11,
  type: 'PERSON',
  personName: '지민',
  personId: 7,
  photoCount: 1,
  reviewStatus: 'UNREVIEWED',
  photos: [BE_PHOTO_IN_ALBUM],
}

/**
 * '분류가 어려워요' 사진 — faceBboxes(애매 얼굴들, 원본 px)·causes(사유 코드) 포함
 * (소스 대조 — BE PR #107(CHMO-393)·CHMO-410, 미채집). 비면 키 자체가 생략된다(@JsonInclude NON_EMPTY).
 * 실서버 채집은 백필이 없어 새 업로드로만 가능 — 배포 확인 시 채집분으로 교체한다(CHMO-412).
 */
export const BE_PHOTO_IN_ALBUM_UNCERTAIN = {
  photoId: 309,
  s3Key: 'originals/events/4/7c1b2f7e-1b3a-4b8e-9a1f-2d4c5e6f7a8b.jpg',
  thumbnailUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/thumbs/309.jpg',
  downloadUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/originals/309.jpg',
  blurry: false,
  eyesClosed: false,
  reviewed: false,
  albumIds: [15],
  faceBboxes: [
    { x: 120, y: 48, w: 260, h: 300 },
    { x: 500, y: 60, w: 180, h: 210 },
  ],
  causes: ['low_resolution', 'small_faces'],
}

/** GET /albums/:id — uncertain 앨범 상세 (소스 대조). 특수 앨범이라 personName·personId가 null */
export const BE_ALBUM_DETAIL_UNCERTAIN = {
  albumId: 15,
  type: 'UNCERTAIN',
  personName: null,
  personId: null,
  photoCount: 1,
  reviewStatus: 'UNREVIEWED',
  photos: [BE_PHOTO_IN_ALBUM_UNCERTAIN],
}

/**
 * GET /albums/:id/download — 멤버용 앨범 ZIP (2026-07-20 실서버 채집, CHMO-338).
 * 뷰어 ZIP과 같은 {downloadUrl, expiresAt} 꼴. 실서버 관찰: 미검토 포함 전체가 zip에 담기고
 * ("-all" 키), person/common 외 특수 앨범은 ALBUM404. expiresAt은 Z가 붙어 온다(보정 무해).
 */
export const BE_MEMBER_ZIP = {
  downloadUrl:
    'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/zips/albums/279-all.zip?response-content-disposition=attachment',
  expiresAt: '2026-07-20T07:11:37.636027303Z',
}

/**
 * GET /albums/:id/move-suggestions — MoveSuggestionResponse[] (2026-07-22 실서버 관찰, CHMO-399).
 * 스웨거 스키마와 달리 type(PERSON/COMMON)이 실재하고, 공통 앨범은 personName이 null이 아니라
 * '공통'으로 채워져 오며, similarity는 인물 앨범에도 null일 수 있다(관찰분은 전원 null —
 * 값이 오는 케이스는 스키마 기준 유지). thumbnailUrl은 CHMO-232 추가분.
 */
export const BE_MOVE_SUGGESTION_PERSON = {
  albumId: 12,
  type: 'PERSON',
  personName: '서준',
  similarity: 0.82,
  thumbnailUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/thumbs/105.jpg',
}
/** 공통 앨범 추천 — personName '공통'(실관찰)·similarity null. 커버 없으면 thumbnailUrl도 null */
export const BE_MOVE_SUGGESTION_COMMON = {
  albumId: 13,
  type: 'COMMON',
  personName: '공통',
  similarity: null,
  thumbnailUrl: null,
}
/** 이름 없는 인물 앨범 추천 — personName·similarity가 null이어도 type이 PERSON이면 인물이다(CHMO-399) */
export const BE_MOVE_SUGGESTION_UNNAMED_PERSON = {
  albumId: 14,
  type: 'PERSON',
  personName: null,
  similarity: null,
  thumbnailUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/thumbs/106.jpg',
}

/**
 * POST /events/:id/albums — CreateAlbumResponse, **빈 앨범**(2026-07-27 실서버 채집, CHMO-456).
 * `{"name":"..."}`만 보낸 응답 원문(COMMON201): 썸네일 필드가 아예 없는 최소형이고 photoCount는 0.
 * 짝(sourceAlbumId+photoIds)을 준 생성=이동도 같은 형태로 photoCount만 옮긴 장수가 된다.
 */
export const BE_CREATE_ALBUM_EMPTY = {
  albumId: 832,
  type: 'PERSON',
  personId: 499,
  personName: '프로브빈앨범',
  photoCount: 0,
}

/** DELETE /photos — DeletePhotosResponse (스키마 기준) */
export const BE_DELETE_PHOTOS = { detachedCount: 2, deletedPhotoCount: 1 }

/**
 * POST /albums/:id/merge-person — MergeAlbumPersonResponse(CHMO-688 BE 스펙·소스 대조 —
 * 실서버 채집 후 교체). albumId는 요청 앨범이 있던 이벤트에서 병합 후 남은 앨범(대상 인물
 * 앨범과 통합됐으면 그 앨범), personName은 대상(남은) 인물 이름.
 */
export const BE_MERGE_ALBUM_PERSON = { albumId: 12, personId: 42, personName: '김민준' }

/** POST /photos/move — MovePhotosResponse (스키마 기준) */
export const BE_MOVE_PHOTOS = { movedCount: 3 }

// ── 공개 요약(14) ────────────────────────────────────────────

/**
 * GET /events/:id/review-summary — ReviewSummaryResponse.
 * **previewThumbnailUrls가 없다** — FE가 albums[].thumbnailUrl에서 파생한다(events.ts).
 * 필드 구성은 채집분, 값은 앨범이 있는 상태로 채웠다(스키마 기준).
 */
export const BE_REVIEW_SUMMARY = {
  eventId: 4,
  eventStatus: 'REVIEW',
  totalAlbums: 3,
  reviewedAlbums: 1,
  unreviewedAlbums: 2,
  totalPhotos: 19,
  reviewedPhotoCount: 5,
  uncertainCount: 2,
  albums: [BE_ALBUM_PERSON, BE_ALBUM_COMMON, BE_ALBUM_EYES_CLOSED],
}

// ── 업로드 3단계 ─────────────────────────────────────────────

/**
 * POST /events/:id/photos/presign — PresignedUploadResponse[](bare 배열).
 * `a.JPG`(대문자)를 보내면 s3Key는 소문자 `.jpg`, contentType은 `image/jpeg`로 온다.
 * uploadUrl의 서명·AWS 키는 치환했다 — 실제 응답엔 X-Amz-Credential·X-Amz-Signature가 붙는다.
 */
export const BE_PRESIGN_UPLOAD = {
  s3Key: 'originals/events/4/0aadfd6b-8dbc-4ed5-810a-348187a1b3d6.jpg',
  uploadUrl:
    'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/originals/events/4/0aadfd6b-8dbc-4ed5-810a-348187a1b3d6.jpg' +
    '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260710T043130Z' +
    '&X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost&X-Amz-Expires=600' +
    '&X-Amz-Credential=<aws-key>&X-Amz-Signature=<signature>',
  contentType: 'image/jpeg',
}

/**
 * POST /events/:id/photos — RegisterPhotosResponse. 등록이 곧 분석 시작이라 jobId가 온다.
 * duplicateCount는 내용 지문 중복으로 제외된 수(CHMO-254) — BE 소스 대조(2026-08-06, CHMO-606)로
 * 추가했고 실채집 재확인 대상. 재업로드에서만 0보다 클 수 있다.
 */
export const BE_REGISTER_PHOTOS = {
  jobId: 'f37f3ad0-3b5b-4b3a-9a6f-3f2f5d0c1e77',
  registeredCount: 2,
  duplicateCount: 0,
}

// ── 학부모 뷰어 ──────────────────────────────────────────────

/** POST /share/:token/unlock — 모임명은 이 응답에만 온다(목록엔 없다) */
export const BE_VIEWER_UNLOCK = {
  viewerToken: '<viewer-jwt>',
  groupId: 6,
  groupName: 'CHMO-194 업로드검증',
}

// `GET /share/:token`은 제작자 목록과 같은 EventSummaryResponse[] — BE_EVENT_SUMMARY를 그대로 쓴다.

/** GET /share/:token/events/:eventId — ViewerEventAlbumsResponse (스키마 기준) */
export const BE_VIEWER_ALBUMS = {
  eventId: 4,
  eventName: '업로드 3단계 검증',
  albums: [BE_ALBUM_PERSON, BE_ALBUM_COMMON],
}

/** ViewerPhotoResponse (스키마 기준) — 원본 url 없이 thumbnailUrl·downloadUrl뿐 */
export const BE_VIEWER_PHOTO = {
  photoId: 101,
  thumbnailUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/thumbs/101.jpg',
  downloadUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/originals/101.jpg',
}

/** GET …/albums/:albumId — ViewerAlbumPhotosResponse (스키마 기준). type이 없고 personName만 온다 */
export const BE_VIEWER_ALBUM_PHOTOS_PERSON = {
  albumId: 11,
  personName: '지민',
  photos: [BE_VIEWER_PHOTO],
}

/** 공통 앨범은 personName이 null — 표시명을 FE가 파생해야 한다 */
export const BE_VIEWER_ALBUM_PHOTOS_COMMON = {
  albumId: 13,
  personName: null,
  photos: [BE_VIEWER_PHOTO],
}

/** GET …/albums/:albumId/download — ViewerZipDownloadResponse (스키마 기준) */
export const BE_VIEWER_ZIP = {
  downloadUrl: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/zips/4_11.zip',
  expiresAt: '2026-07-10T04:41:30.123456',
}

// ── 약관 동의 (CHMO-514 — BE 스펙 문서 기준, 미채집) ─────────

/**
 * GET·POST `/agreements` — AgreementStatusResponse (스펙 문서 기준).
 * 출처: CheeseMoa-BE `docs/spec/CHMO-514-약관-동의-기록.md` §3(PR #154). 실서버 채집은 배포 후.
 * ⚠ `CHILD_CONSENT_ATTESTED`(scope GROUP)의 `agreed`는 모임별이라 **항상 false**로 온다.
 */
export const BE_AGREEMENTS = {
  agreements: [
    { type: 'AGE_14_OVER', currentVersion: '1.0', required: true, scope: 'USER', agreed: false },
    {
      type: 'TERMS_OF_SERVICE',
      currentVersion: '1.0',
      required: true,
      scope: 'USER',
      agreed: false,
    },
    { type: 'PRIVACY_POLICY', currentVersion: '1.0', required: true, scope: 'USER', agreed: false },
    { type: 'FACE_DATA', currentVersion: '1.0', required: true, scope: 'USER', agreed: false },
    { type: 'MARKETING', currentVersion: '1.0', required: false, scope: 'USER', agreed: false },
    {
      type: 'CHILD_CONSENT_ATTESTED',
      currentVersion: '1.0',
      required: true,
      scope: 'GROUP',
      agreed: false,
    },
  ],
}

// ── 관리자 (CHMO-377·378 — BE 스펙 문서 §3·admin/dto 소스 대조 2026-08-04) ──
// 실서버 채집은 관리자 role 부여(DB 직접 변경) 후에만 가능하다 — 가드 403만 채집됐고
// 성공 응답은 BE 스펙 문서의 예시·DTO 레코드 정의에서 옮겼다(계약은 형태지 값이 아니다).
// 모임 이름은 응답 3곳 어디에도 없다(BE CHMO-668 / PR #203 — 이벤트 이름·닉네임은 존치).

/** GET /admin/me — AdminProfileResponse */
export const BE_ADMIN_PROFILE = { userId: 3, nickname: '김선생', role: 'ADMIN' }

/**
 * GET /admin/stats — AdminStatsResponse(recentGroups는 생성일 내림차순 5개 고정). 활동 2종·최근 업로드
 * 10개·excludedUserIds는 CHMO-932 스펙 §3.2 예시(BE PR #317 소스 대조 — 미채집). 둘째 업로드 행은
 * 업로더 없는 옛 사진(CHMO-805 이전)이라 uploader 둘 다 null.
 */
export const BE_ADMIN_STATS = {
  totals: { users: 123, groups: 45, events: 210, photos: 8123 },
  last7Days: { newGroups: 3, newEvents: 12, newPhotos: 950, activeGroups: 7, uploaders: 9 },
  recentGroups: [{ groupId: 45, memberCount: 8, createdAt: '2026-08-01T10:00:00' }],
  recentUploads: [
    {
      eventId: 101,
      eventName: '가을 소풍',
      groupId: 45,
      groupType: 'BUSINESS',
      lastUploadedAt: '2026-10-16T09:12:00',
      photoCount: 120,
      uploaderUserId: 3,
      uploaderNickname: '김선생',
    },
    {
      eventId: 97,
      eventName: '옛 사진 정리',
      groupId: 40,
      groupType: 'GENERAL',
      lastUploadedAt: '2026-10-15T08:00:00',
      photoCount: 4,
      uploaderUserId: null,
      uploaderNickname: null,
    },
  ],
  excludedUserIds: [17, 34],
}

/** GET /admin/groups — result(bare 배열). pageInfo는 봉투에 나란히 실린다(아래). 뒤 둘은 CHMO-932 */
export const BE_ADMIN_GROUP_ROWS = [
  {
    groupId: 45,
    groupType: 'BUSINESS', // SpaceType — CHMO-621(B-6)부터 싣는다
    memberCount: 8,
    eventCount: 12,
    photoCount: 830,
    createdAt: '2026-08-01T10:00:00',
    lastUploadedAt: '2026-10-16T09:12:00',
    last7DaysPhotoCount: 120,
  },
]

/**
 * GET /admin/organization-inquiries — OrganizationInquiryResponse(PATCH 응답도 같은 형태).
 * BE CHMO-810 PR #271 계약(티켓 코멘트 대조 — 실서버 채집은 배포 후). 둘째 행은 선택 항목이
 * 빈 경우: contactRole null · PIN 계정이라 socialProviders 빈 배열.
 */
export const BE_ADMIN_INQUIRY_ROWS = [
  {
    id: 12,
    status: 'RECEIVED',
    organizationType: 'KINDERGARTEN',
    organizationName: '치즈유치원',
    region: '서울',
    contactName: '김선생',
    contactPhone: '01012345678',
    contactRole: 'DIRECTOR',
    privacyConsentVersion: '1.0',
    userId: 7,
    userNickname: '치즈',
    socialProviders: ['KAKAO'],
    createdAt: '2026-09-15T10:00:00+09:00',
    updatedAt: '2026-09-15T10:00:00+09:00',
  },
  {
    id: 11,
    status: 'CONTACTED',
    organizationType: 'DAYCARE',
    organizationName: '햇살어린이집',
    region: '경기',
    contactName: '박선생',
    contactPhone: '01098765432',
    contactRole: null,
    privacyConsentVersion: '1.0',
    userId: 8,
    userNickname: '햇살',
    socialProviders: [],
    createdAt: '2026-09-14T09:00:00',
    updatedAt: '2026-09-14T11:30:00',
  },
]

/**
 * GET /admin/reports — AdminReportSummaryResponse(PATCH 응답도 같은 형태).
 * **2026-09-27 스테이징 실채집**(BE CHMO-861 develop 배포분 — 관리자 계정으로 `?status=ALL`).
 * 시각은 스펙 문서 예시(오프셋 없는 UTC)와 달리 **`+09:00` 오프셋·마이크로초**가 붙어 온다 —
 * client.ts는 오프셋이 있으면 손대지 않는다. 첫 행은 내용 없는 사진 신고, 둘째 행은 모임·사진이
 * 없는 문의다(둘 다 PIN 계정이라 socialProviders 빈 배열). null 필드도 키를 싣는다.
 */
export const BE_ADMIN_REPORT_ROWS = [
  {
    id: 2,
    type: 'DELETION_REQUEST',
    status: 'RECEIVED',
    preview: null,
    userId: 3,
    userNickname: 'test',
    socialProviders: [],
    groupId: 28,
    groupName: '터터',
    photoId: 4901,
    hasAttachments: false,
    createdAt: '2026-09-27T17:20:19.758082+09:00',
    answeredAt: null,
    updatedAt: '2026-09-27T17:20:19.758082+09:00',
  },
  {
    id: 1,
    type: 'OTHER',
    status: 'RECEIVED',
    preview: '스테이징 문의 테스트입니다.',
    userId: 27,
    userNickname: 'staging-admin-0927',
    socialProviders: [],
    groupId: null,
    groupName: null,
    photoId: null,
    hasAttachments: false,
    createdAt: '2026-09-27T16:59:38.582479+09:00',
    answeredAt: null,
    updatedAt: '2026-09-27T16:59:38.582479+09:00',
  },
]

/**
 * GET /admin/reports/2 — 사진 신고 상세 **2026-09-27 스테이징 실채집**(presigned 쿼리는 치환).
 * 사진 신고는 내용 없이 접수돼 content null, 앱이 싣는 기기 정보가 온다.
 */
export const BE_ADMIN_REPORT_PHOTO_DETAIL = {
  ...BE_ADMIN_REPORT_ROWS[0],
  content: null,
  attachments: [],
  photo: {
    id: 4901,
    url: 'https://cheesemoa-dev.s3.ap-northeast-2.amazonaws.com/originals/events/72/fab0b514-fb1d-4f96-b5b8-9fa7bf50690e.jpg?X-Amz-Signature=<presigned>',
    eventId: 72,
    eventName: '확인',
  },
  photoDeleted: false,
  reporterRole: 'EDITOR',
  client: { appVersion: '2.4.0+28', platform: 'IOS', osVersion: '26.5', deviceModel: 'iPhone18,1' },
  followUpOf: null,
  reply: null,
}

/**
 * GET /admin/reports/:id — AdminReportDetailResponse(`POST …/reply` 응답도 같은 형태).
 * BE CHMO-861 스펙 문서 예시 그대로(첨부·사진·역할·기기·이어서 문의·답변이 모두 찬 경우 — 스테이징엔
 * 아직 이렇게 다 찬 건이 없어 실채집이 아니다. 시각 형식만 실측대로 오프셋을 붙였다).
 */
export const BE_ADMIN_REPORT_DETAIL = {
  id: 41,
  type: 'APP_ERROR',
  status: 'ANSWERED',
  preview: '사진 30장을 올리다가 앱이 꺼졌어요.',
  userId: 128,
  userNickname: '치즈',
  socialProviders: ['KAKAO'],
  groupId: 32,
  groupName: '햇살반',
  photoId: 91,
  hasAttachments: true,
  createdAt: '2026-09-27T15:30:00.123456+09:00',
  answeredAt: '2026-09-28T09:00:00.654321+09:00',
  updatedAt: '2026-09-28T09:00:00.654321+09:00',
  content: '사진 30장을 올리다가 앱이 꺼졌어요.',
  attachments: [{ url: 'https://cdn.example/reports/128/a.jpg?X-Amz-Signature=1' }],
  photo: {
    id: 91,
    url: 'https://cdn.example/originals/events/17/p.jpg?X-Amz-Signature=2',
    eventId: 17,
    eventName: '운동회',
  },
  photoDeleted: false,
  reporterRole: 'EDITOR',
  client: {
    appVersion: '2.4.0+28',
    platform: 'IOS',
    osVersion: '26.0',
    deviceModel: 'iPhone15,4',
  },
  followUpOf: { id: 33, preview: '이전 문의 내용' },
  reply: {
    content: '확인 후 수정했습니다.',
    answeredAt: '2026-09-28T09:00:00.654321+09:00',
    answeredBy: 3,
  },
}

/**
 * 상세의 빈 경우 — 사진이 지워진 사진 신고(photo null + photoDeleted), 내용·기기·이어서 문의·답변 없음,
 * 모임을 나간 신고자(reporterRole null). BE assembler가 null을 싣는 자리를 한 번에 모았다(실채집 행 위에
 * 조립 — photoDeleted true는 스테이징에서 아직 못 만든 상태라 소스 대조분이다).
 */
export const BE_ADMIN_REPORT_DETAIL_SPARSE = {
  ...BE_ADMIN_REPORT_ROWS[0],
  content: null,
  attachments: [],
  photo: null,
  photoDeleted: true,
  reporterRole: null,
  client: null,
  followUpOf: null,
  reply: null,
}

/** 봉투의 pageInfo — BE common/response/PageInfo(Response.onSuccess(status, Page)) */
export const BE_ADMIN_PAGE_INFO = {
  page: 0,
  size: 20,
  hasNext: false,
  totalElements: 1,
  totalPages: 1,
}

/**
 * GET /admin/groups/:groupId — AdminGroupDetailResponse(멤버 PENDING 포함·publishedAt null 가능).
 * 멤버 role은 CHMO-605 리네이밍 값(EDITOR/VIEWER — BE 스펙 대조, 실서버 채집 후 교체).
 * 과금·패스·지급 이력·마지막 업로드·멤버 accountType·이벤트 lastUploadedAt은 CHMO-932 스펙 §3.3 예시 —
 * 개인 범위라 `institution`은 null, 패스는 운영자 지급 1건으로 살아 있다. 지급 행의 createdAt은
 * BaseEntity(LocalDateTime)라 오프셋이 없고 accessFrom·accessUntil은 Instant(`Z`)다.
 */
export const BE_ADMIN_GROUP_DETAIL = {
  groupId: 45,
  groupType: 'BUSINESS',
  createdAt: '2026-08-01T10:00:00',
  ownerUserId: 3,
  ownerNickname: '김선생',
  memberCount: 8,
  billingScope: 'PERSONAL',
  billingOwnerUserId: 3,
  billingOwnerNickname: '김선생',
  lastUploadedAt: '2026-10-16T09:12:00',
  pass: {
    active: true,
    accessUntil: '2026-10-23T03:00:00Z',
    grants: [
      {
        grantId: 7,
        plan: 'DAY_7',
        accessFrom: '2026-10-16T03:00:00Z',
        accessUntil: '2026-10-23T03:00:00Z',
        adminId: 17,
        memo: '설문 참여 보상',
        createdAt: '2026-10-16T12:00:00',
        revokedAt: null,
        revokedBy: null,
      },
    ],
  },
  institution: null,
  members: [
    {
      userId: 3,
      nickname: '김선생',
      role: 'EDITOR',
      status: 'ACTIVE',
      joinedAt: '2026-08-01T10:00:00',
      accountType: 'PERSONAL',
    },
    {
      userId: 9,
      nickname: '민준아빠',
      role: 'VIEWER',
      status: 'PENDING',
      joinedAt: '2026-08-02T09:30:00',
      accountType: 'PERSONAL',
    },
  ],
  events: [
    {
      eventId: 101,
      name: '여름 물놀이',
      status: 'PUBLISHED',
      eventDate: '2026-07-30',
      photoCount: 120,
      albumCount: 9,
      createdAt: '2026-07-30T14:00:00',
      publishedAt: '2026-07-31T09:00:00',
      lastUploadedAt: '2026-10-16T09:12:00',
    },
    {
      eventId: 98,
      name: '가을 발표회 준비',
      status: 'EMPTY',
      eventDate: '2026-08-20',
      photoCount: 0,
      albumCount: 0,
      createdAt: '2026-08-01T11:00:00',
      publishedAt: null,
      lastUploadedAt: null,
    },
  ],
}

/** 같은 상세의 **기관 범위** 변주 — `institution`이 채워지고(과금 소유 기관 유예 중) 패스는 빈 객체 */
export const BE_ADMIN_GROUP_DETAIL_INSTITUTION = {
  ...BE_ADMIN_GROUP_DETAIL,
  billingScope: 'INSTITUTION',
  billingOwnerUserId: 52,
  billingOwnerNickname: '햇살유치원',
  pass: { active: false, accessUntil: null, grants: [] },
  institution: {
    accessStatus: 'GRACE',
    accessUntil: '2026-10-10T00:00:00Z',
    graceEndsAt: '2026-10-17T00:00:00Z',
  },
  members: [{ ...BE_ADMIN_GROUP_DETAIL.members[0], userId: 52, nickname: '햇살유치원', accountType: 'ORGANIZATION' }],
}

// ── 이벤트 팝업·혜택 푸시 어드민 (CHMO-928 — BE CHMO-926 PR #312 develop 머지분) ──
// **BE 스펙(docs/spec/CHMO-926-*.md §3)·DTO 소스 대조**: 운영 미배포(2026-10-14 프로브)라 채집 전.
// 직렬화 규칙 두 가지를 그대로 옮겼다 — Instant(startsAt·scheduledAt 등)는 UTC `Z`, BaseEntity
// 감사 시각(createdAt·updatedAt)은 LocalDateTime이라 오프셋이 없다(client.ts가 'Z'를 붙인다).
// 선택 필드는 `@JsonInclude(NON_NULL)`이라 비면 키째 없다.

/** GET /admin/popups/:id — AdminPopupResponse(@JsonUnwrapped content — 요청 필드가 평면으로) */
export const BE_ADMIN_POPUP = {
  popupId: 12,
  imageUrl: 'https://cheesemoa-original.s3.ap-northeast-2.amazonaws.com/popups/3/a.jpg?X-Amz-Signature=<sig>',
  title: '10월 설문',
  imageKey: 'popups/3/0b6b2c1e-5d7a-4c47-9d0f-2a1f3e4b5c6d.jpg',
  imageAlt: '치즈모아 사용 설문 — 참여하면 기프티콘',
  ctaLabel: '설문 참여하기',
  linkUrl: 'https://forms.gle/survey',
  linkTarget: 'IN_APP',
  audience: 'ALL',
  locale: 'ko',
  startsAt: '2026-10-14T23:00:00Z',
  endsAt: '2026-10-31T14:59:59Z',
  priority: 0,
  hideOption: 'TODAY',
  active: true,
  minAppVersion: '2.7.0',
  status: 'SCHEDULED',
  createdBy: 3,
  updatedBy: 3,
  createdAt: '2026-10-14T10:00:00',
  updatedAt: '2026-10-14T10:00:00',
}

/** 선택 필드(ctaLabel·minAppVersion)가 빈 팝업 — NON_NULL이라 키째 없다 */
export const BE_ADMIN_POPUP_SPARSE = {
  popupId: 11,
  imageUrl: BE_ADMIN_POPUP.imageUrl,
  title: 'Summer survey',
  imageKey: BE_ADMIN_POPUP.imageKey,
  imageAlt: 'CheeseMoa survey',
  linkUrl: 'https://forms.gle/survey',
  linkTarget: 'EXTERNAL',
  audience: 'ORGANIZATION',
  locale: 'en',
  startsAt: '2026-10-14T23:00:00Z',
  endsAt: '2026-10-31T14:59:59Z',
  priority: 0,
  hideOption: 'NONE',
  active: false,
  status: 'OFF',
  createdBy: 3,
  updatedBy: 3,
  createdAt: '2026-10-14T10:00:00',
  updatedAt: '2026-10-14T10:00:00',
}

/** POST /admin/popups/images/presign — PopupImageResponse(15분 PUT) */
export const BE_ADMIN_POPUP_IMAGE = {
  key: 'popups/3/0b6b2c1e-5d7a-4c47-9d0f-2a1f3e4b5c6d.jpg',
  uploadUrl: 'https://cheesemoa-original.s3.ap-northeast-2.amazonaws.com/popups/3/x.jpg?X-Amz-Signature=<sig>',
  expiresAt: '2026-10-14T10:15:00Z',
}

/**
 * POST /admin/push-campaigns — 예약 접수 응답(스펙 §3 예시 + 감사 시각). title·body는 **자동 문구가
 * 붙은 최종본**이고, 아직 보내지 않아 sentAt·fcmMessageIds·failureCode 키가 없다(NON_NULL).
 * fcmMessageIds는 빈 리스트로 온다(NON_NULL은 빈 컬렉션을 거르지 않는다).
 */
export const BE_ADMIN_CAMPAIGN_SCHEDULED = {
  campaignId: 42,
  status: 'SCHEDULED',
  title: '(광고) 설문 참여 혜택',
  body: '의견을 들려주세요.\n치즈모아 · 수신 거부: 내 정보 > 혜택·이벤트 알림',
  link: 'https://forms.gle/survey',
  scheduledAt: '2026-10-15T01:00:00Z',
  createdBy: 3,
  createdAt: '2026-10-14T10:20:00',
  fcmMessageIds: [],
}

/** 테스트 발송이 끝난 이력 행 — testUserId·sentAt·기기별 message id가 있고 link·scheduledAt은 없다 */
export const BE_ADMIN_CAMPAIGN_TEST_SENT = {
  campaignId: 43,
  status: 'SENT',
  title: '(광고) 설문 참여 혜택',
  body: '의견을 들려주세요.\n치즈모아 · 수신 거부: 내 정보 > 혜택·이벤트 알림',
  testUserId: 3,
  createdBy: 3,
  createdAt: '2026-10-14T10:21:00',
  sentAt: '2026-10-14T01:21:05Z',
  fcmMessageIds: ['projects/cheese-moa/messages/0:1700000000000000%abc'],
}

/** 결과 불명 — 자동 재발송하지 않는 상태(운영자가 확인 후 새로 보낸다) */
export const BE_ADMIN_CAMPAIGN_UNKNOWN = {
  campaignId: 44,
  status: 'UNKNOWN',
  title: '(광고) 주말 혜택',
  body: '혜택을 확인하세요.\n치즈모아 · 수신 거부: 내 정보 > 혜택·이벤트 알림',
  createdBy: 3,
  createdAt: '2026-10-14T11:00:00',
  fcmMessageIds: [],
  failureCode: 'FCM_RESULT_UNKNOWN',
}

/** GET /admin/push-campaigns/recipients — CampaignRecipientsResponse(원시 long) */
export const BE_ADMIN_CAMPAIGN_RECIPIENTS = { userCount: 100, deviceCount: 140 }

// ── 기간 이용권 결제 (BE CHMO-847 — 스펙 기준, 미채집) ──────────
// 출처: BE 리포 `docs/spec/CHMO-847-BUSINESS-모임-월-구독-결제.md` §3 예시 원문(2026-10-04 대조).
// 운영 BE에 BILLING_ENABLED가 켜진 뒤 실서버 채집으로 교체한다. clientKey는 자리표시자.

/** GET /groups/:id/passes/plans (스펙 기준) */
export const BE_PASS_PLANS = [
  { code: 'DAY_1', durationDays: 1, usdAmount: 1.0 },
  { code: 'DAY_3', durationDays: 3, usdAmount: 1.5 },
  { code: 'DAY_7', durationDays: 7, usdAmount: 2.5 },
]

/** POST /groups/:id/pass-orders — 국내(KRW) 주문(스펙 기준) */
export const BE_PASS_ORDER_DOMESTIC = {
  orderId: 'pass_3f2a',
  orderName: 'CheeseMoa 3일 이용권',
  clientKey: 'test_ck_<krw>',
  planCode: 'DAY_3',
  market: 'DOMESTIC',
  amount: 2138,
  currency: 'KRW',
  usdAmount: 1.5,
  usdKrwRate: 1425.31,
  rateDate: '2026-10-02',
  expiresAt: '2026-10-02T07:30:00Z',
}

/** POST /groups/:id/pass-orders — 해외(USD) 주문: 환율 필드 생략(스펙 기준) */
export const BE_PASS_ORDER_INTERNATIONAL = {
  orderId: 'pass_9c1b',
  orderName: 'CheeseMoa 3일 이용권',
  clientKey: 'test_ck_<usd>',
  planCode: 'DAY_3',
  market: 'INTERNATIONAL',
  amount: 1.5,
  currency: 'USD',
  usdAmount: 1.5,
  expiresAt: '2026-10-02T07:30:00Z',
}

/** POST /groups/:id/pass-orders/:orderId/confirm (스펙 기준) */
export const BE_PASS_CONFIRM = {
  orderId: 'pass_3f2a',
  status: 'SUCCEEDED',
  planCode: 'DAY_3',
  amount: 2138,
  currency: 'KRW',
  approvedAt: '2026-10-02T07:03:00Z',
  accessFrom: '2026-10-02T07:03:00Z',
  accessUntil: '2026-10-05T07:03:00Z',
}

/** GET /groups/:id/passes/current (스펙 기준) */
export const BE_PASS_CURRENT = { active: true, accessUntil: '2026-10-05T07:03:00Z' }

// ── 어드민 사용자 장수·기관 구독 (CHMO-931 — BE CHMO-912 `AdminController` 어드민 절) ──
// **BE 스펙(`docs/spec/CHMO-912-*.md` §3.5)·DTO 소스 대조(2026-10-15, 미채집)** — 운영 배포는
// 2026-10-14 main 머지로 끝났지만 관리자 계정 실채집은 아직이다. Instant는 `Z`, 장부 createdAt은
// LocalDateTime(오프셋 없음 → client.ts가 'Z' 보정), paidOn은 LocalDate.

/** GET /admin/users — AdminUserSearchResponse(커서 목록). 닉네임에 숫자가 섞인 계정도 같이 걸린다 */
export const BE_ADMIN_USER_SEARCH = {
  items: [
    { userId: 7, nickname: '치즈', accountType: 'ORGANIZATION' },
    { userId: 3, nickname: '김선생', accountType: 'PERSONAL' },
  ],
  nextCursor: 3,
  hasNext: true,
}

/**
 * GET /admin/users/{id}/credits — AdminUserCreditsResponse. 둘째 행은 운영자 조정(메모 있음 ·
 * 모임/이벤트 null), 첫 행은 업로드 차감(모임·이벤트 이름은 지금 값).
 */
export const BE_ADMIN_USER_CREDITS = {
  userId: 3,
  balance: 88,
  ledger: {
    items: [
      {
        ledgerId: 103,
        delta: -32,
        balanceAfter: 88,
        reason: 'UPLOAD',
        groupId: 10,
        groupName: '가족 여행',
        eventId: 31,
        eventName: '제주 2일차',
        memo: null,
        createdAt: '2026-10-07T09:30:00',
      },
      {
        ledgerId: 101,
        delta: 120,
        balanceAfter: 120,
        reason: 'ADMIN_ADJUST',
        groupId: null,
        groupName: null,
        eventId: null,
        eventName: null,
        memo: '고객 지원 보상',
        createdAt: '2026-10-06T09:00:00',
      },
    ],
    nextCursor: 101,
    hasNext: true,
  },
}

/** POST /admin/users/{id}/credit-adjustments(201) — AdminCreditAdjustmentResponse */
export const BE_ADMIN_CREDIT_ADJUSTMENT = { userId: 3, delta: 100, balance: 188 }

/** GET /admin/organizations/subscriptions — 둘째 행은 지워진 계정(nickname null)·기간 없음(BLOCKED) */
export const BE_ADMIN_SUBSCRIPTION_ROWS = {
  items: [
    {
      subscriptionId: 2,
      userId: 7,
      nickname: '치즈',
      status: 'ACTIVE',
      accessUntil: '2026-11-01T00:00:00Z',
      graceEndsAt: '2026-11-08T00:00:00Z',
    },
    {
      subscriptionId: 1,
      userId: 8,
      nickname: null,
      status: 'BLOCKED',
      accessUntil: null,
      graceEndsAt: null,
    },
  ],
  nextCursor: null,
  hasNext: false,
}

/** POST /admin/organizations/{id}/subscription-periods(201) · DELETE …/{periodId}(200, nickname null) */
export const BE_ADMIN_SUBSCRIPTION = {
  organizationUserId: 7,
  nickname: '치즈',
  accessStatus: 'ACTIVE',
  accessUntil: '2026-11-01T00:00:00Z',
  graceEndsAt: '2026-11-08T00:00:00Z',
  period: {
    periodId: 5,
    accessFrom: '2026-10-01T00:00:00Z',
    accessUntil: '2026-11-01T00:00:00Z',
    amountKrw: 100000,
    paidOn: '2026-09-30',
    payerName: '치즈유치원',
    invoiceNo: 'INV-2026-001',
    memo: '10월 이용료',
    voidedAt: null,
  },
}

// ── 어드민 조회 확장·패스 지급·과금 범위 (CHMO-932 — BE PR #317 스펙 §3.4~3.7·admin/dto 소스 대조, 미채집) ──

/**
 * GET /admin/organizations/{userId}/subscription — 무효화분 포함 최신순. 첫 행은 가입 체험(CHMO-940 —
 * `adminId` null·`kind` TRIAL), 둘째는 운영자 등록이 무효화된 행.
 */
export const BE_ADMIN_SUBSCRIPTION_HISTORY = {
  userId: 52,
  nickname: '햇살유치원',
  accountType: 'ORGANIZATION',
  accessStatus: 'ACTIVE',
  accessUntil: '2026-10-30T03:00:00Z',
  graceEndsAt: '2026-11-06T03:00:00Z',
  periods: [
    {
      periodId: 9,
      kind: 'TRIAL',
      accessFrom: '2026-10-16T03:00:00Z',
      accessUntil: '2026-10-30T03:00:00Z',
      amountKrw: 0,
      paidOn: '2026-10-16',
      payerName: '체험',
      invoiceNo: null,
      memo: '가입 체험',
      adminId: null,
      createdAt: '2026-10-16T12:00:00',
      voidedAt: null,
      voidedBy: null,
    },
    {
      periodId: 4,
      kind: 'ADMIN',
      accessFrom: '2026-09-01T00:00:00Z',
      accessUntil: '2026-10-01T00:00:00Z',
      amountKrw: 100000,
      paidOn: '2026-08-30',
      payerName: '햇살유치원',
      invoiceNo: 'INV-2026-004',
      memo: '9월 이용료 · 중복 입금',
      adminId: 17,
      createdAt: '2026-08-30T09:00:00',
      voidedAt: '2026-08-31T01:00:00Z',
      voidedBy: 17,
    },
  ],
}

/** GET /admin/users/{userId} — AdminUserSummaryResponse(속한 모임은 승인 대기 포함, 모임 이름 없음) */
export const BE_ADMIN_USER_SUMMARY = {
  userId: 3,
  nickname: '김선생',
  accountType: 'PERSONAL',
  role: 'USER',
  createdAt: '2026-08-01T10:00:00',
  socialProviders: ['KAKAO'],
  groups: [
    { groupId: 45, groupType: 'BUSINESS', role: 'EDITOR', status: 'ACTIVE' },
    { groupId: 40, groupType: 'GENERAL', role: 'EDITOR', status: 'PENDING' },
  ],
}

/** POST /admin/groups/{id}/pass-grants(201) — AdminPassGrantResponse */
export const BE_ADMIN_PASS_GRANT = {
  grantId: 7,
  groupId: 45,
  plan: 'DAY_7',
  accessFrom: '2026-10-16T03:00:00Z',
  accessUntil: '2026-10-23T03:00:00Z',
}

/** DELETE /admin/pass-grants/{id}(200) — passAccessUntil은 회수 뒤 패스 만료(지금으로 당겨진 값) */
export const BE_ADMIN_PASS_GRANT_REVOKE = {
  grantId: 7,
  groupId: 45,
  revokedAt: '2026-10-17T01:00:00Z',
  passAccessUntil: '2026-10-17T01:00:00Z',
}

/** PUT /admin/groups/{id}/billing-scope(200) — AdminBillingScopeResponse */
export const BE_ADMIN_BILLING_SCOPE = { groupId: 45, billingScope: 'INSTITUTION', billingOwnerUserId: 52 }
