/**
 * MSW 목 응답 픽스처 (CHMO-219) — `docs/api-spec.md` 평문 계약.
 *
 * FE 개발 기본값이 아직 MSW라(`VITE_ENABLE_MSW=true`) 같은 도메인 함수가 이 형태도 통과해야 한다.
 * 목이 BE 형태로 이행(CHMO-195)하면 **이 파일과 mappers.ts의 MSW 폴백 분기를 함께 지운다** —
 * 그때 여기 상수를 참조하는 테스트가 지워야 할 분기를 정확히 짚어 준다.
 */

/** 실패 응답은 봉투가 아니라 `{ error: { code, message } }` */
export function mswError(code: string, message: string) {
  return { error: { code, message } }
}

// ── 모임 ─────────────────────────────────────────────────────

/** 목록·상세 모두 `id`(≠groupId), 상세엔 share 포함 */
export const MSW_GROUP = {
  id: 1,
  name: '해바라기반',
  memberCount: 3,
  eventCount: 2,
  role: null,
  createdAt: '2026-06-27T09:41:00+09:00',
}

/** 목록은 객체로 감싼다(BE는 bare 배열) */
export const MSW_GROUPS = { groups: [MSW_GROUP] }

// ── 이벤트 ───────────────────────────────────────────────────

/** `date`(≠eventDate) · 소문자 status · `coverPhotoId`(≠thumbnailPhotoId) */
export const MSW_EVENT = {
  id: 1,
  groupId: 1,
  name: '여름 물놀이',
  date: '2026-06-27',
  status: 'review',
  photoCount: 120,
  albumCount: 8,
  createdAt: '2026-06-27T09:41:00+09:00',
  publishedAt: null,
}

export const MSW_EVENTS = { events: [MSW_EVENT] }

// ── 앨범 · 사진 ──────────────────────────────────────────────

/** 표시명 `name`을 목이 직접 준다(BE는 personName만 주고 특수 앨범은 null) */
export const MSW_ALBUM_PERSON = {
  id: 1,
  eventId: 1,
  type: 'person',
  personId: 1,
  name: '지민',
  photoCount: 12,
  unreviewedPhotoCount: 3,
  coverPhotoId: 101,
  coverThumbnailUrl: 'https://picsum.photos/seed/101/400/300',
  visibleToViewer: true,
}

export const MSW_ALBUM_EYES_CLOSED = {
  id: 4,
  eventId: 1,
  type: 'eyes_closed',
  personId: null,
  name: '눈감은 사진',
  photoCount: 2,
  unreviewedPhotoCount: 2,
  coverPhotoId: null,
  coverThumbnailUrl: null,
  visibleToViewer: false,
}

export const MSW_ALBUMS = { albums: [MSW_ALBUM_PERSON, MSW_ALBUM_EYES_CLOSED] }

/** `flags` 객체(BE는 eyesClosed/blurry 평면) · 원본 `url` 보유 */
export const MSW_PHOTO = {
  id: 101,
  eventId: 1,
  albumIds: [1],
  url: 'https://picsum.photos/seed/101/1600/1200',
  thumbnailUrl: 'https://picsum.photos/seed/101/400/300',
  width: 1600,
  height: 1200,
  flags: { eyesClosed: false, blurry: false },
  reviewed: false,
  createdAt: '2026-06-27T09:41:00+09:00',
}

/** 상세는 `{ album, photos }`로 감싼다(BE는 photos를 앨범에 내장) */
export const MSW_ALBUM_DETAIL = { album: MSW_ALBUM_PERSON, photos: [MSW_PHOTO] }

/** 추천은 표시명 `name`을 준다(BE는 personName) */
export const MSW_MOVE_SUGGESTIONS = {
  suggestions: [
    { albumId: 2, name: '서준', similarity: 0.82 },
    { albumId: 3, name: '공통', similarity: null },
  ],
}

/** 옛 계약 — BE의 `{detachedCount, deletedPhotoCount}`와 다르다 */
export const MSW_DELETE_PHOTOS = { removedCount: 2, albumId: 1 }

// ── 공개 전 검수 ─────────────────────────────────────────────

/** 목은 previewThumbnailUrls를 직접 준다(BE는 albums[]에서 파생해야 한다) */
export const MSW_REVIEW_SUMMARY = {
  photoCount: 19,
  albumCount: 3,
  reviewedPhotoCount: 5,
  totalPhotoCount: 19,
  uncertainCount: 2,
  previewThumbnailUrls: ['https://picsum.photos/seed/101/400/300'],
}

// ── 학부모 뷰어 ──────────────────────────────────────────────

/** 옛 계약 — 모임을 `group` 객체로 감싼다(BE는 groupId·groupName 평면) */
export const MSW_VIEWER_UNLOCK = {
  viewerToken: 'vwr_mock_token',
  group: { id: 1, name: '해바라기반' },
}

/** 목은 목록 응답에 모임명을 함께 준다(BE는 bare 배열이라 unlock 때 캐시한 이름을 쓴다) */
export const MSW_VIEWER_EVENTS = {
  group: { id: 1, name: '해바라기반' },
  events: [
    {
      id: 1,
      name: '여름 물놀이',
      date: '2026-06-27',
      photoCount: 80,
      albumCount: 6,
      coverPhotoId: 101,
      coverThumbnailUrl: 'https://picsum.photos/seed/101/400/300',
      publishedAt: '2026-06-28T10:00:00+09:00',
    },
  ],
}

/** 이벤트를 `event` 객체로 감싼다(BE는 eventId·eventName 평면) */
export const MSW_VIEWER_ALBUMS = {
  event: { id: 1, name: '여름 물놀이' },
  albums: [
    {
      id: 1,
      type: 'person',
      name: '지민',
      photoCount: 12,
      coverPhotoId: 101,
      coverThumbnailUrl: 'https://picsum.photos/seed/101/400/300',
    },
  ],
}

/** 앨범 요약을 `album` 객체로 준다(BE는 albumId·personName 평면) */
export const MSW_VIEWER_ALBUM_PHOTOS = {
  album: { id: 1, name: '지민', photoCount: 1 },
  photos: [
    {
      id: 101,
      url: 'https://picsum.photos/seed/101/1600/1200',
      thumbnailUrl: 'https://picsum.photos/seed/101/400/300',
      downloadUrl: 'https://picsum.photos/seed/101/1600/1200',
    },
  ],
}
