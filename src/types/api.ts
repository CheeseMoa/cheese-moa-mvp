/**
 * API 계약 타입 (docs/api-spec.md §2 리소스 스키마).
 * FE는 이 타입에 맞춰 MSW 목 데이터로 개발한다. BE 확정 시 동기화.
 */

export type ID = string
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
export type ReviewStatus = 'unreviewed' | 'reviewed'

export interface Album {
  id: ID
  eventId?: ID
  type: AlbumType
  /** 인물 앨범만 값 보유(모임 단위 인물 식별자), 그 외 null */
  personId: ID | null
  name: string
  photoCount: number
  reviewStatus?: ReviewStatus
  coverPhotoId: ID | null
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
  reviewedAlbumCount: number
  totalAlbumCount: number
  uncertainCount: number
  previewPhotoIds: ID[]
}

// ── 이동 추천 ────────────────────────────────────────────────
export interface MoveSuggestion {
  albumId: ID
  name: string
  /** 대표 벡터 기반 유사도(0~1). '공통'은 null */
  similarity: number | null
}

// ── 뷰어(학부모 무로그인) ────────────────────────────────────
export interface ViewerUnlockResponse {
  viewerToken: string
  group: Pick<Group, 'id' | 'name'>
}
