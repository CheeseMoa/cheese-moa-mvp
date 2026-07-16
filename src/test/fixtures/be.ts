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
 * GET /groups/:id/invite — 평문 모임 비밀번호 포함(값은 치환). 목록엔 joinKey가 없어 이걸로 대조한다.
 * joinUrl은 **쿼리형**이라 FE 라우트(`/join/:joinKey`)와 안 맞는다 — FE는 이 값을 쓰지 않고
 * joinKey로 파생한다(CHMO-237). 2026-07-16 재채집: 오리진이 EC2 IP → 배포 FE(vercel)로 바뀌었지만 여전히 쿼리형.
 */
export const BE_GROUP_INVITE = {
  joinKey: '<join-key>',
  password: '<group-password>',
  joinUrl: 'https://cheese-moa-mvp.vercel.app/join?joinKey=<join-key>',
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

/** GET /albums/:id/move-suggestions — MoveSuggestionResponse[] (스키마 기준) */
export const BE_MOVE_SUGGESTION_PERSON = { albumId: 12, personName: '서준', similarity: 0.82 }
/** 공통 앨범 추천엔 이름도 유사도도 없다 */
export const BE_MOVE_SUGGESTION_COMMON = { albumId: 13, personName: null, similarity: null }

/** DELETE /photos — DeletePhotosResponse (스키마 기준) */
export const BE_DELETE_PHOTOS = { detachedCount: 2, deletedPhotoCount: 1 }

/** POST /photos/move — MovePhotosResponse (스키마 기준) */
export const BE_MOVE_PHOTOS = { movedCount: 3 }

// ── 공개 전 검수 ─────────────────────────────────────────────

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

/** POST /events/:id/photos — RegisterPhotosResponse. 등록이 곧 분석 시작이라 jobId가 온다 */
export const BE_REGISTER_PHOTOS = {
  jobId: 'f37f3ad0-3b5b-4b3a-9a6f-3f2f5d0c1e77',
  registeredCount: 2,
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
