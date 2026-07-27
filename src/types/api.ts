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

// 학부모 전환(CHMO-444 · docs/parent-model-api-draft.md) — role은 모임 멤버십 단위(user×group).
// 계정 유형은 나누지 않고, 어느 초대 링크(joinKey 2종)로 합류했는지가 role을 정한다(Q6).
export type GroupRole = 'teacher' | 'parent'
/** 합류는 역할 무관 승인제(§1) — 신청(pending) 후 선생님 승인으로 active */
export type MembershipStatus = 'pending' | 'active'

/** 모임 목록 항목의 내 멤버십(§7-2) — PENDING 사용자는 이 값 하나로 끝(다른 모임 API 미호출) */
export interface MyMembership {
  role: GroupRole
  status: MembershipStatus
  /** 학부모 신청 원문(자유 텍스트) — 홈 카드 "신청: 김민준" 표기용. 선생님은 빈 배열 */
  claimedChildNames: string[]
}

export interface Group {
  id: ID
  name: string
  /** 내 멤버십(role·승인 상태) — 실 BE 미배포 응답엔 없어 undefined(기존 제작자 동작 유지) */
  myMembership?: MyMembership
  /** ACTIVE 멤버 수 — PARENT·PENDING 응답엔 멤버 정보가 없다(§7-3 미노출) */
  memberCount?: number
  /** 상세 카운트 분리(§7-3 — "선생님 3 · 학부모 12") — memberCount는 과도기 병행 */
  teacherCount?: number
  parentCount?: number
  /** BE 상세(GroupDetailResponse)엔 없음 — 상세 화면은 이벤트 목록 길이로 파생(CHMO-192) */
  eventCount?: number
  createdAt: ISODateTime
}

/** POST /groups/join — 즉시 합류가 아니라 신청(PENDING) 생성이다(§1 승인제) */
export interface JoinGroupResult {
  groupId: ID
  groupName: string
  role: GroupRole
  status: MembershipStatus
}

// ── 초대 (TEACHER 전용 — Q3 · 평문 비밀번호 포함) ────────────
export interface GroupInviteChannel {
  joinKey: string
  /** 합류 비밀번호 평문 — 선생님은 모임 비밀번호, 학부모는 기존 sharePassword 재사용(Q2) */
  password: string
  joinUrl: string
}

/**
 * 초대 정보 2종(Q6 — 링크가 role을 정한다).
 * parent는 **구계약 공존 구간엔 null** — 현재 배포된 실 BE는 선생님 채널(평면 응답)만 준다.
 * 소비 화면은 null이면 학부모 초대 UI를 숨긴다(BE 초안 배포 후 non-null 보장되면 좁힌다).
 */
export interface GroupInviteInfo {
  teacher: GroupInviteChannel
  parent: GroupInviteChannel | null
}

export interface GroupShareInfo extends GroupShare {
  /** 학부모 전용 비밀번호(모임 비밀번호와 별개) — 공유 화면 전용 노출 */
  password: string
}

// ── 합류 신청·멤버·인물 매핑 (TEACHER 전용 — §2·§4) ──────────
export interface JoinRequest {
  id: ID
  userId: ID
  nickname: string
  role: GroupRole
  /** 학부모 신청 원문 — 승인 후 연결할 때 선생님이 참조(연결 전까지 보존) */
  childNames: string[]
  createdAt: ISODateTime
}

export interface PersonMapping {
  personId: ID
  /** 인물 이름 — 이름 없는 인물이면 null(표시 폴백은 화면 소유) */
  personName: string | null
}

export interface GroupMember {
  userId: ID
  nickname: string
  role: GroupRole
  /** 신청 원문(학부모) — 선생님은 빈 배열 */
  childNames: string[]
  /** 학부모↔인물 매핑(다대다 — 다자녀·부모 2인 허용). 미연결 = 빈 배열(별도 상태 없음, §2) */
  mappings: PersonMapping[]
}

// ── 학부모 사진 조회 (ACTIVE PARENT 전용 — §5, 뷰어 로직 이관) ──
export interface ParentPhoto {
  id: ID
  url: string
  thumbnailUrl: string
  downloadUrl: string
}

/** GET /events/:id/parent-photos — 매핑된 인물 + 공통, published만, 플랫(앨범 계층 없음) */
export interface ParentEventPhotos {
  eventId: ID
  eventName: string
  photos: ParentPhoto[]
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
