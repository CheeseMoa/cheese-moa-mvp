/**
 * API 계약 타입 (docs/api-spec.md §2 리소스 스키마).
 * FE는 이 타입에 맞춰 MSW 목 데이터로 개발한다. BE 확정 시 동기화.
 */

/** 리소스 식별자 — BE는 전부 int64 숫자 id (CHMO-191) */
export type ID = number
/** ISO 8601 (예: 2026-06-27T09:41:00+09:00) */
export type ISODateTime = string
/** YYYY-MM-DD */
export type ISODate = string

// ── 공통 에러 ────────────────────────────────────────────────
export interface ApiError {
  error: {
    code: string
    message: string
  }
}

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
  eventCount: number
  joinKey: string
  /** MVP에서 항상 null (권한 등급 없음) */
  role: null
  /** 학부모 무로그인 공유(모임 단위). 목록 응답에는 생략될 수 있음 */
  share?: GroupShare
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
}

// ── AnalysisJob (분석 상태) ──────────────────────────────────
export type AnalysisStatus = 'analyzing' | 'done' | 'failed'

export interface AnalysisJob {
  eventId: ID
  status: AnalysisStatus
}

// ── Album (앨범) ─────────────────────────────────────────────
export type AlbumType = 'person' | 'common' | 'uncertain' | 'eyes_closed' | 'blurry'

export interface Album {
  id: ID
  eventId?: ID
  type: AlbumType
  /** 인물 앨범만 값 보유(모임 단위 인물 식별자), 그 외 null */
  personId: ID | null
  name: string
  photoCount: number
  /** 앨범 내 미검토 사진 수(파생값) — 검토 상태는 사진 단위(Photo.reviewed) */
  unreviewedPhotoCount?: number
  coverPhotoId: ID | null
  /** 커버 사진 썸네일 URL(파생값 — coverPhotoId 없으면 null). 08 앨범 그리드 카드 커버용 */
  coverThumbnailUrl?: string | null
  /** 학부모 뷰어 노출 여부(person/common만 true) */
  visibleToViewer?: boolean
}

// ── Photo (사진) ─────────────────────────────────────────────
export interface PhotoFlags {
  eyesClosed: boolean
  blurry: boolean
}

export interface Photo {
  id: ID
  eventId?: ID
  /** 앨범과 다대다 — 여러 앨범에 속할 수 있음 */
  albumIds: ID[]
  url: string
  thumbnailUrl: string
  width?: number
  height?: number
  flags?: PhotoFlags
  /** 검토 여부(사진 단위) — 미검토 사진은 뷰어 응답에서 제외 */
  reviewed: boolean
  /** 뷰어 다운로드용 */
  downloadUrl?: string
  createdAt?: ISODateTime
}

// ── 인증 응답 ────────────────────────────────────────────────
export interface AuthResponse {
  accessToken: string
  user: User
}

// ── 업로드 presign ───────────────────────────────────────────
export interface PresignFileRequest {
  filename: string
  contentType: string
  size: number
}

export interface PresignUpload {
  photoId: ID
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  expiresAt: ISODateTime
}

export interface PresignResponse {
  uploads: PresignUpload[]
}

// ── 분석 요청 ────────────────────────────────────────────────
export interface AnalyzeRequest {
  excludeEyesClosed: boolean
  excludeBlurry: boolean
}

// ── 공개 전 검수 요약 ────────────────────────────────────────
export interface ReviewSummary {
  photoCount: number
  albumCount: number
  /** 검토는 사진 단위 — 검토 완료된 사진 수 / 전체 사진 수 */
  reviewedPhotoCount: number
  totalPhotoCount: number
  uncertainCount: number
  /**
   * 학부모 뷰 프리뷰용 썸네일 URL(파생값 — coverThumbnailUrl과 동일 규칙).
   * 뷰어 노출 규칙(person/common 앨범 + 검토 완료)을 적용한 사진만, 최대 6장.
   * id만으론 URL 조립 불가라 서버가 완성된 URL을 내려준다.
   */
  previewThumbnailUrls: string[]
}

// ── 이동 추천 ────────────────────────────────────────────────
export interface MoveSuggestion {
  albumId: ID
  name: string
  /** 대표 벡터 기반 유사도(0~1). '공통'은 null */
  similarity: number | null
}

// ── 사진 이동/제거 (다대다 연결 교체·해제) ───────────────────
export interface MovePhotosResponse {
  movedCount: number
  sourceAlbumId: ID
  targetAlbumId: ID
}

export interface RemovePhotosResponse {
  removedCount: number
  albumId: ID
}

// ── 뷰어(학부모 무로그인) ────────────────────────────────────
// 뷰어 응답은 서버 필터링 결과만 담는다: published 이벤트 · person/common 앨범 ·
// 검토 완료(reviewed) 사진. 카운트/커버도 필터링된 사진 기준 파생값.
export interface ViewerUnlockResponse {
  viewerToken: string
  group: Pick<Group, 'id' | 'name'>
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
