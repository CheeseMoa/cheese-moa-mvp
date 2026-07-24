/**
 * API 계약 타입 (docs/api-spec.md §2 리소스 스키마).
 * 화면은 이 타입만 본다 — 서버 응답 형태(봉투·BE 필드명)는 src/api/ 엔드포인트 계층이
 * 흡수해 이 타입으로 변환한다(CHMO-192). MSW 목도 같은 형태로 응답한다(CHMO-195).
 */

/** 리소스 식별자 — BE는 전부 int64 숫자 id (CHMO-191) */
export type ID = number
/** ISO 8601 (예: 2026-06-27T09:41:00+09:00) */
export type ISODateTime = string
/** YYYY-MM-DD */
export type ISODate = string

// ── User (제작자) ────────────────────────────────────────────
export interface User {
  id: ID
  nickname: string
  createdAt: ISODateTime
}

// ── Group (모임) ─────────────────────────────────────────────
export interface GroupShare {
  token: string
  url: string
  hasPassword: boolean
}

export interface Group {
  id: ID
  name: string
  memberCount: number
  /** BE 상세(GroupDetailResponse)엔 없음 — 상세 화면은 이벤트 목록 길이로 파생(CHMO-192) */
  eventCount?: number
  /** MVP에서 항상 null (권한 등급 없음) */
  role: null
  createdAt: ISODateTime
}

// ── 초대 / 학부모 공유 (멤버 전용 — 평문 비밀번호 포함) ──────
export interface GroupInviteInfo {
  joinKey: string
  /** 제작자 합류용 모임 비밀번호 — 초대 화면 전용 노출 */
  password: string
  joinUrl: string
}

export interface GroupShareInfo extends GroupShare {
  /** 학부모 전용 비밀번호(모임 비밀번호와 별개) — 공유 화면 전용 노출 */
  password: string
}

// ── Event (이벤트) ───────────────────────────────────────────
export type EventStatus = 'empty' | 'analyzing' | 'review' | 'ready' | 'published'

export interface EventItem {
  id: ID
  groupId?: ID
  name: string
  date: ISODate
  status: EventStatus
  photoCount: number
  albumCount: number
  createdAt?: ISODateTime
  publishedAt?: ISODateTime | null
  /** 뷰어 목록에서 커버 썸네일 */
  coverPhotoId?: ID | null
  /**
   * AI 분석 진행률(CHMO-287) — **상세 응답에만** 있고 목록엔 없다.
   * 분석 job 진행 중에만 non-null(완료 직후 잠시 100을 유지하다 null로 돌아간다 — 실서버 관찰).
   */
  progress?: AnalysisProgress | null
  /**
   * 발행 대기 수(재공개 게이트 CHMO-324) — 검토됐지만 아직 발행되지 않은 사진.
   * **상세 응답에만** 있고 목록엔 없다(05 카드 배지가 불가한 이유 — 목록 필드는 BE 후속).
   * published 이벤트에서 0보다 크면 [공개하기] 재진입(08 배지·14 버튼)의 근거가 된다(CHMO-265).
   */
  pendingPublishCount?: number
}

/** AI 분석 진행률 — GET /events/:id의 `progress`(BE가 percent까지 계산해 준다) */
export interface AnalysisProgress {
  processed: number
  total: number
  percent: number
}

// ── 분석 상태 ────────────────────────────────────────────────
/** BE `AnalysisStatusResponse.AnalysisStatus` — 이벤트 상태에서 유도한 값(진행률·폴링 없음) */
export type AnalysisStatus = 'none' | 'analyzing' | 'done'

/**
 * GET /events/:id/analysis — 분석 상태 확인.
 * 분석 **실패**는 BE에 표현이 없다(이벤트를 EMPTY로 되돌려 `none`과 구분 불가 — CHMO-218).
 */
export interface AnalysisJob {
  analysisStatus: AnalysisStatus
  eventStatus: EventStatus
}

// ── Album (앨범) ─────────────────────────────────────────────
export type AlbumType = 'person' | 'common' | 'uncertain' | 'eyes_closed' | 'blurry'

export interface Album {
  id: ID
  type: AlbumType
  /** 인물 앨범만 값 보유(모임 단위 인물 식별자), 그 외 null */
  personId: ID | null
  name: string
  photoCount: number
  /** 앨범 내 미검토 사진 수(파생값) — 앨범 상세 응답엔 없다(목록 전용) */
  unreviewedPhotoCount?: number
  coverPhotoId: ID | null
  /** 커버 사진 썸네일 URL(파생값 — coverPhotoId 없으면 null). 08 앨범 그리드 카드 커버용 */
  coverThumbnailUrl?: string | null
  /** 학부모 뷰어 노출 여부(person/common만 true — 서버는 주지 않는다, type에서 파생) */
  visibleToViewer?: boolean
}

// ── Photo (사진) ─────────────────────────────────────────────
export interface PhotoFlags {
  eyesClosed: boolean
  blurry: boolean
}

/** '분류가 어려워요' 사진에서 분류를 어렵게 한(애매한) 얼굴 하나의 bbox — 원본 이미지 px, 좌상단 x·y (CHMO-412) */
export interface FaceBbox {
  x: number
  y: number
  w: number
  h: number
}

export interface Photo {
  id: ID
  /** 앨범과 다대다 — 여러 앨범에 속할 수 있음 */
  albumIds: ID[]
  /** 원본 URL — 서버엔 downloadUrl뿐이라 같은 값이다(치수는 주지 않는다) */
  url: string
  thumbnailUrl: string
  flags?: PhotoFlags
  /** 검토 여부(사진 단위) — 미검토 사진은 뷰어 응답에서 제외 */
  reviewed: boolean
  downloadUrl?: string
  /** 분류를 어렵게 한 얼굴들의 bbox — uncertain으로 분류된 사진에만 값이 있다(그 외 빈 배열, CHMO-412) */
  faceBboxes: FaceBbox[]
  /** 분류가 어려웠던 이유 코드(AI 고정 계약) — 문구 변환은 lib/uncertainCauses.ts가 소유 */
  causes: string[]
}

// ── 인증 응답 ────────────────────────────────────────────────
/**
 * BE AuthResponse엔 user 객체가 없다(userId·nickname·accessToken·refreshToken 평면 필드).
 * 화면이 쓰는 건 두 토큰뿐이라 FE 계약도 이것만 둔다.
 * accessToken(만료 1시간) 401 시 refreshToken으로 자동 재발급한다(CHMO-193, client.ts).
 */
export interface AuthResponse {
  accessToken: string
  refreshToken: string
}

// ── 업로드 3단계 (presign → S3 PUT → 등록) ───────────────────
/** BE는 contentType을 `fileName` 확장자로 유도한다 — 요청에 담지 않는다 */
export interface PresignFileRequest {
  fileName: string
  size: number
}

export interface PresignUpload {
  /** 등록(POST /events/:id/photos) 때 되돌려 보낼 업로드 키 */
  s3Key: string
  uploadUrl: string
  /** S3 서명에 묶인 값 — PUT의 Content-Type 헤더가 이것과 정확히 같아야 서명이 맞는다 */
  contentType: string
}

/** POST /events/:id/photos — 등록이 곧 분석 시작이라 품질 제외 옵션을 함께 보낸다 */
export interface RegisterPhotosRequest {
  s3Keys: string[]
  excludeEyesClosed: boolean
  excludeBlurry: boolean
}

export interface RegisterPhotosResult {
  jobId: string
  registeredCount: number
}

// ── 공개 요약(14) ────────────────────────────────────────────
export interface ReviewSummary {
  photoCount: number
  albumCount: number
  /**
   * 검토 진척은 앨범 단위로 보여준다(CHMO-357) — 검토 행위가 앨범 일괄뿐이라
   * 사진 수 정산은 선생님의 머릿속 진척("앨범 2/3 끝냄")과 어긋난다(피드백 #17).
   * 집계는 학부모에게 보일 인물·공통(사진 보유)만 — 특수 앨범 검토는 공개 결과와 무관.
   */
  reviewedAlbumCount: number
  reviewableAlbumCount: number
  /**
   * 학부모 뷰 프리뷰용 앨범(파생값 — BE albums[]에 뷰어 노출 규칙 적용).
   * person/common 앨범 중 검토 완료 사진이 있는 것만 — 공개 시 학부모 목록(15)에 보일 앨범과 동일.
   * 14 미리보기가 08과 같은 앨범 카드(앨범명·검토 테두리)로 그린다(CHMO-346).
   */
  previewAlbums: Album[]
}

// ── 이동 추천 ────────────────────────────────────────────────
export interface MoveSuggestion {
  albumId: ID
  name: string
  /** 공통 사진첩 여부 — BE type(PERSON/COMMON)에서 파생. similarity 유무로 판정하지 않는다(CHMO-399) */
  isCommon: boolean
  /** 대표 벡터 기반 유사도(0~1) — 실 BE는 인물 앨범에도 null을 줄 수 있다(미계산, 2026-07-22 관찰) */
  similarity: number | null
  /** 대표 사진 썸네일 URL(CHMO-232) — 커버 없는 앨범은 null(플레이스홀더 폴백) */
  thumbnailUrl: string | null
}

// ── 사진 이동/제거 (다대다 연결 교체·해제) ───────────────────
export interface MovePhotosResponse {
  movedCount: number
}

/**
 * BE DeletePhotosResponse 형태(CHMO-192) — 다대다에서 "연결만 해제"(detached)와
 * "마지막 연결이라 완전 삭제"(deleted)를 구분해 준다.
 */
export interface DeletePhotosResponse {
  detachedCount: number
  deletedPhotoCount: number
}

// ── 뷰어(학부모 무로그인) ────────────────────────────────────
// 뷰어 응답은 서버 필터링 결과만 담는다: published 이벤트 · person/common 앨범 ·
// 검토 완료(reviewed) 사진. 카운트/커버도 필터링된 사진 기준 파생값.
/** BE UnlockViewerResponse 형태(CHMO-192) — 모임명은 뷰어 화면들이 캐시해 쓴다(lib/viewer.ts) */
export interface ViewerUnlockResponse {
  viewerToken: string
  groupId: ID
  groupName: string
}

export interface ViewerEvent {
  id: ID
  name: string
  date: ISODate
  photoCount: number
  albumCount: number
  coverPhotoId: ID | null
  /** 커버 사진 썸네일 URL(파생값 — Album.coverThumbnailUrl 선례, 커버 없으면 null). 15-L 카드 커버용 */
  coverThumbnailUrl: string | null
  publishedAt: ISODateTime | null
}

export interface ViewerAlbum {
  id: ID
  type: AlbumType
  name: string
  photoCount: number
  coverPhotoId: ID | null
  /** 커버 사진 썸네일 URL(파생값 — 커버 없으면 null). 15 앨범 카드 커버용 */
  coverThumbnailUrl: string | null
}

export interface ViewerPhoto {
  id: ID
  url: string
  thumbnailUrl: string
  downloadUrl: string
}

export interface AlbumDownloadResponse {
  downloadUrl: string
  expiresAt: ISODateTime
}
